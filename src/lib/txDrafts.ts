// ============================================================
// Шилжүүлгийн даалгавар / ноорог-сагс (Шат 2, 2026-08-05) — веб тал.
//   Даалгавар = tx_drafts + tx_draft_lines (бараа × тоо төлөвлөгөө);
//   уншигч (C5) эсвэл вебээс уншсан таг tx_draft_items-д сагслагдана.
//   Илгээхэд create_transaction → жинхэнэ TRF/ADJ гүйлгээ (падаан, түүх,
//   хүлээн авалт бүгд ердийн замаараа). Бичилт зөвхөн RPC-ээр.
// ============================================================
import { supabase } from "./supabaseClient";
import { labelMap } from "../i18n/labelMap";

export type DraftType = "transfer" | "other" | "sale" | "return";
export type DraftStatus = "open" | "submitted" | "cancelled";

export const DRAFT_TYPE_LABEL: Record<DraftType, string> = labelMap({
  transfer: "transactions.type.transfer",
  other: "transactions.type.other",
  sale: "transactions.type.sale",
  return: "transactions.type.return",
});

export interface DraftLine {
  product_id: string;
  expected: number;
  picked: number;
}

export interface DraftRow {
  id: string;
  type: DraftType;
  from_branch: string | null;
  to_branch: string | null;
  note: string | null;
  status: DraftStatus;
  created_by: string | null;
  created_at: string;
  created_by_email: string | null;
  item_count: number; // сагсанд орсон ширхэг
  lines: DraftLine[]; // хоосон = чөлөөт сагс (жагсаалтгүй)
}

/** Нээлттэй бүх ноорог (даалгавар + чөлөөт сагс) — явц, үүсгэгчтэй нь. */
export async function listOpenDrafts(): Promise<DraftRow[]> {
  const { data: drafts, error } = await supabase
    .from("tx_drafts")
    .select("id, type, from_branch, to_branch, note, status, created_by, created_at")
    .eq("status", "open")
    .order("created_at", { ascending: false });
  if (error) throw error;
  const rows = (drafts ?? []) as Omit<DraftRow, "created_by_email" | "item_count" | "lines">[];
  if (rows.length === 0) return [];
  const ids = rows.map((r) => r.id);

  const [{ data: progress, error: pErr }, { data: profs }] = await Promise.all([
    supabase.from("tx_draft_progress").select("draft_id, product_id, expected, picked").in("draft_id", ids),
    supabase.from("profiles").select("id, email"),
  ]);
  if (pErr) throw pErr;

  // Сагсны ширхэг: ноорог цөөн тул тус бүрд head count (мөр татахгүй).
  const counts = await Promise.all(
    ids.map((id) =>
      supabase
        .from("tx_draft_items")
        .select("*", { count: "exact", head: true })
        .eq("draft_id", id)
        .then((r) => [id, r.count ?? 0] as const)
    )
  );
  const countMap = new Map(counts);
  const emailMap = new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const linesMap = new Map<string, DraftLine[]>();
  for (const p of (progress ?? []) as (DraftLine & { draft_id: string })[]) {
    const list = linesMap.get(p.draft_id) ?? [];
    list.push({ product_id: p.product_id, expected: Number(p.expected), picked: Number(p.picked) });
    linesMap.set(p.draft_id, list);
  }

  return rows.map((r) => ({
    ...r,
    created_by_email: r.created_by ? (emailMap.get(r.created_by) ?? null) : null,
    item_count: countMap.get(r.id) ?? 0,
    lines: linesMap.get(r.id) ?? [],
  }));
}

/** Даалгавар үүсгэнэ (жагсаалттай). Ноорогийн id буцаана. */
export async function createDraftJob(params: {
  fromBranch: string;
  toBranch: string;
  note: string | null;
  lines: { product_id: string; qty: number }[];
}): Promise<string> {
  const { data, error } = await supabase.rpc("create_tx_draft", {
    p_type: "transfer",
    p_to_branch: params.toBranch,
    p_note: params.note,
    p_from_branch: params.fromBranch,
    p_lines: params.lines,
  });
  if (error) throw error;
  return data as string;
}

/** Ноорог цуцлах (гүйлгээ үүсэхгүй; сагсны таг-уудад юу ч болохгүй). */
export async function cancelDraft(id: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_tx_draft", { p_draft: id });
  if (error) throw error;
}
