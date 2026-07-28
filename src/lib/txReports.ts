// ============================================================
// Тайлан — Шилжүүлэг (transfer) ба Актлалт (other/write-off) хоёулаа
// transactions + transaction_items (үнийн snapshot) дээр суурилдаг тул
// нэг татагч хуваалцана. RLS үйлчилнэ; шинэ DB объект шаардлагагүй.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";
import type { TxStatus } from "./transactions";

export interface TxReportRow {
  id: string;
  tx_number: string | null;
  status: TxStatus;
  from_branch: string | null;
  to_branch: string | null;
  from_name: string | null;
  to_name: string | null;
  created_at: string;
  completed_at: string | null;
  created_by_email: string | null;
  note: string | null;
  qty: number;
  value: number; // snapshot үнийн нийлбэр (үнэгүй item 0-ээр)
  noPriceQty: number; // үнийн snapshot-гүй ширхэг
}

function nextDay(iso: string): string {
  const d = new Date(iso + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Интервалын transfer/other гүйлгээнүүд item-ийн тоо, дүнтэйгээ. */
export async function fetchTxReport(
  type: "transfer" | "other",
  from: string,
  to: string
): Promise<TxReportRow[]> {
  const [{ data: txs, error }, { data: brs }, { data: profs }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, tx_number, status, from_branch, to_branch, note, created_by, created_at, completed_at")
      .eq("type", type)
      .gte("created_at", from)
      .lt("created_at", nextDay(to))
      .order("created_at", { ascending: false }),
    supabase.from("branches").select("id, name"),
    supabase.from("profiles").select("id, email"),
  ]);
  if (error) throw error;
  const rows = (txs ?? []) as {
    id: string; tx_number: string | null; status: TxStatus;
    from_branch: string | null; to_branch: string | null; note: string | null;
    created_by: string | null; created_at: string; completed_at: string | null;
  }[];
  if (rows.length === 0) return [];

  const bMap = new Map(((brs ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const pMap = new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  // Item-ийн тоо + snapshot дүнг гүйлгээгээр нэгтгэнэ (300-аар багцалж татна).
  const agg = new Map<string, { qty: number; value: number; noPriceQty: number }>();
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data: items, error: iErr } = await supabase
      .from("transaction_items")
      .select("transaction_id, price")
      .in("transaction_id", ids.slice(i, i + 300));
    if (iErr) throw iErr;
    for (const it of (items ?? []) as { transaction_id: string; price: number | null }[]) {
      const a = agg.get(it.transaction_id) ?? { qty: 0, value: 0, noPriceQty: 0 };
      a.qty += 1;
      if (it.price != null) a.value += it.price;
      else a.noPriceQty += 1;
      agg.set(it.transaction_id, a);
    }
  }

  return rows.map((r) => {
    const a = agg.get(r.id) ?? { qty: 0, value: 0, noPriceQty: 0 };
    return {
      id: r.id,
      tx_number: r.tx_number,
      status: r.status,
      from_branch: r.from_branch,
      to_branch: r.to_branch,
      from_name: r.from_branch ? (bMap.get(r.from_branch) ?? null) : null,
      to_name: r.to_branch ? (bMap.get(r.to_branch) ?? null) : null,
      created_at: r.created_at,
      completed_at: r.completed_at,
      created_by_email: r.created_by ? (pMap.get(r.created_by) ?? null) : null,
      note: r.note,
      ...a,
    };
  });
}

export interface GroupedTx {
  key: string;
  label: string;
  txCount: number;
  qty: number;
  value: number;
  noPriceQty: number;
}

export type TransferGroup = "direction" | "month" | "status";
export type WriteoffGroup = "note" | "branch" | "user" | "month";

export const TRF_GROUP_LABEL: Record<TransferGroup, string> = labelMap({
  direction: "reports.groupDirection",
  month: "reports.groupMonth",
  status: "reports.groupStatus",
});

export const WO_GROUP_LABEL: Record<WriteoffGroup, string> = labelMap({
  note: "reports.groupNote",
  branch: "reports.groupBranch",
  user: "reports.groupUser",
  month: "reports.groupMonth",
});

/** Гүйлгээнүүдийг сонгосон түвшингээр бүлэглэнэ (label-функцээр). */
export function groupTx(
  rows: TxReportRow[],
  keyOf: (r: TxReportRow) => { key: string; label: string }
): GroupedTx[] {
  const acc = new Map<string, GroupedTx>();
  for (const r of rows) {
    const { key, label } = keyOf(r);
    const cur = acc.get(key) ?? { key, label, txCount: 0, qty: 0, value: 0, noPriceQty: 0 };
    cur.txCount += 1;
    cur.qty += r.qty;
    cur.value += r.value;
    cur.noPriceQty += r.noPriceQty;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) =>
    /^\d{4}-\d{2}$/.test(a.key) && /^\d{4}-\d{2}$/.test(b.key)
      ? a.key.localeCompare(b.key)
      : b.value - a.value || b.qty - a.qty
  );
}

export const noBranchLabel = () => i18n.t("reports.noBranch");
export const noNoteLabel = () => i18n.t("reports.noNote");
export const unknownUserLabel = () => i18n.t("reports.unknownUser");
