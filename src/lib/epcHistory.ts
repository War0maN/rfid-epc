// ============================================================
// EPC-ийн амьдралын түүх (epc_events) — уншиж, харуулахад бэлэн
// мөр болгон хувиргана. Индекстэй тул нэг EPC-ийн түүх сая мөрөөс
// ч хурдан олдоно. RLS-ийн ачаар зөвхөн өөрийн тенант.
// ============================================================
import { supabase } from "./supabaseClient";
import { labelOf } from "./epcStatus";

export type EpcEventType =
  | "created"
  | "printed"
  | "status_change"
  | "transfer_out"
  | "transfer_in"
  | "transfer_cancel"
  | "sold"
  | "other"
  | "returned";

export const EVENT_META: Record<EpcEventType, { label: string; cls: string }> = {
  created: { label: "Үүссэн", cls: "bg-slate-100 text-slate-600" },
  printed: { label: "Хэвлэж идэвхжүүлсэн", cls: "bg-emerald-50 text-emerald-700" },
  status_change: { label: "Төлөв өөрчилсөн", cls: "bg-indigo-50 text-indigo-700" },
  transfer_out: { label: "Шилжүүлэгт гарсан", cls: "bg-amber-50 text-amber-700" },
  transfer_in: { label: "Шилжүүлэг хүлээн авсан", cls: "bg-emerald-50 text-emerald-700" },
  transfer_cancel: { label: "Шилжүүлэг цуцлагдсан", cls: "bg-slate-100 text-slate-600" },
  sold: { label: "Борлуулсан", cls: "bg-sky-50 text-sky-700" },
  other: { label: "Бусад гүйлгээ", cls: "bg-rose-50 text-rose-700" },
  returned: { label: "Буцаалт", cls: "bg-violet-50 text-violet-700" },
};

interface RawEvent {
  id: number;
  event: EpcEventType;
  old_status: string | null;
  new_status: string | null;
  old_branch: string | null;
  new_branch: string | null;
  tx_id: string | null;
  reason: string | null;
  actor_id: string | null;
  created_at: string;
}

export interface EpcHistoryItem {
  id: number;
  event: EpcEventType;
  detail: string; // хүн уншихуйц тайлбар (салбар, төлөвийн шилжилт г.м.)
  reason: string | null; // гар өөрчлөлтийн шалтгаан эсвэл гүйлгээний тэмдэглэл
  actor_email: string | null;
  created_at: string;
}

/** Нэг EPC-ийн бүрэн түүх — хамгийн эртнээс сүүл рүү (амьдралын дараалал). */
export async function fetchEpcHistory(epcId: string): Promise<EpcHistoryItem[]> {
  const { data, error } = await supabase
    .from("epc_events")
    .select("id, event, old_status, new_status, old_branch, new_branch, tx_id, reason, actor_id, created_at")
    .eq("epc_id", epcId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true });
  if (error) throw error;
  const events = (data ?? []) as RawEvent[];
  if (events.length === 0) return [];

  // Жижиг lookup-ууд: салбарын нэр, хэрэглэгчийн имэйл, гүйлгээний тэмдэглэл/очих салбар.
  const txIds = [...new Set(events.map((e) => e.tx_id).filter((v): v is string => !!v))];
  const [{ data: brs }, { data: profs }, txRes] = await Promise.all([
    supabase.from("branches").select("id, name"),
    supabase.from("profiles").select("id, email"),
    txIds.length
      ? supabase.from("transactions").select("id, note, to_branch").in("id", txIds)
      : Promise.resolve({ data: [] as { id: string; note: string | null; to_branch: string | null }[] }),
  ]);
  const bMap = new Map(((brs ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const pMap = new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));
  const tMap = new Map(
    ((txRes.data ?? []) as { id: string; note: string | null; to_branch: string | null }[]).map((t) => [t.id, t])
  );

  const bn = (id: string | null) => (id ? (bMap.get(id) ?? "?") : "(Салбаргүй)");

  return events.map((ev) => {
    const tx = ev.tx_id ? tMap.get(ev.tx_id) : undefined;
    let detail: string;
    switch (ev.event) {
      case "created":
        detail = `Салбар: ${bn(ev.new_branch)}`;
        break;
      case "printed":
        detail = "Шошго хэвлэгдэж, агуулахад бүртгэгдсэн";
        break;
      case "transfer_out":
        detail = `${bn(ev.new_branch)} → ${tx ? bn(tx.to_branch) : "?"}`;
        break;
      case "transfer_in":
        detail = `${bn(ev.old_branch)} → ${bn(ev.new_branch)}`;
        break;
      case "transfer_cancel":
        detail = `${bn(ev.new_branch)}-д буцсан`;
        break;
      case "sold":
      case "other":
        detail = `Салбар: ${bn(ev.new_branch ?? ev.old_branch)}`;
        break;
      case "returned":
        detail = `Идэвхтэй болж буцсан — Салбар: ${bn(ev.new_branch ?? ev.old_branch)}`;
        break;
      default:
        detail = `${labelOf(ev.old_status ?? "")} → ${labelOf(ev.new_status ?? "")}`;
    }
    return {
      id: ev.id,
      event: ev.event,
      detail,
      reason: ev.reason || tx?.note || null,
      actor_email: ev.actor_id ? (pMap.get(ev.actor_id) ?? null) : null,
      created_at: ev.created_at,
    };
  });
}
