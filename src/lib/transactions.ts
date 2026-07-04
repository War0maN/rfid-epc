// ============================================================
// Гүйлгээ (Phase 5) — борлуулалт / шилжүүлэг / бусад гаргалт.
//   Бүх бичилт атом RPC-ээр (create_transaction, receive_transfer,
//   cancel_transfer) — статус/тенант/салбарын шалгалт DB талд.
//   Гүйлгээ түүхэн бүртгэл тул хэзээ ч устгагдахгүй.
// ============================================================
import { supabase } from "./supabaseClient";

export type TxType = "sale" | "transfer" | "other";
export type TxStatus = "pending" | "done" | "cancelled";

export const TX_TYPES: TxType[] = ["sale", "transfer", "other"];
export const TX_TYPE_LABEL: Record<TxType, string> = {
  sale: "Борлуулсан",
  transfer: "Шилжүүлэг",
  other: "Бусад гүйлгээ",
};
export const TX_TYPE_BADGE: Record<TxType, string> = {
  sale: "bg-sky-50 text-sky-700",
  transfer: "bg-amber-50 text-amber-700",
  other: "bg-rose-50 text-rose-700",
};
export const TX_STATUS_LABEL: Record<TxStatus, string> = {
  pending: "Хүлээгдэж буй",
  done: "Дууссан",
  cancelled: "Цуцлагдсан",
};
export const TX_STATUS_BADGE: Record<TxStatus, string> = {
  pending: "bg-amber-50 text-amber-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-slate-100 text-slate-500",
};

export interface TxRow {
  id: string;
  type: TxType;
  status: TxStatus;
  from_branch: string | null;
  to_branch: string | null;
  from_branch_name: string | null;
  to_branch_name: string | null;
  note: string | null;
  created_by_email: string | null;
  created_at: string;
  completed_at: string | null;
  item_count: number;
}

/** Гүйлгээний жагсаалт — салбарын нэр, хийсэн хүний имэйл, item тоог JS талд холбоно. */
export async function listTransactions(): Promise<TxRow[]> {
  const [{ data: txs, error: tErr }, { data: brs }, { data: profs }] = await Promise.all([
    supabase
      .from("transactions")
      .select("id, type, status, from_branch, to_branch, note, created_by, created_at, completed_at")
      .order("created_at", { ascending: false }),
    supabase.from("branches").select("id, name"),
    supabase.from("profiles").select("id, email"),
  ]);
  if (tErr) throw tErr;
  const rows = (txs ?? []) as (Omit<TxRow, "from_branch_name" | "to_branch_name" | "created_by_email" | "item_count"> & {
    created_by: string | null;
  })[];
  if (rows.length === 0) return [];

  // Item тоог гүйлгээгээр бүлэглэж татна (жагсаалт богино тул нэг select хангалттай).
  const { data: items, error: iErr } = await supabase
    .from("transaction_items")
    .select("transaction_id")
    .in("transaction_id", rows.map((r) => r.id));
  if (iErr) throw iErr;
  const countByTx = new Map<string, number>();
  for (const it of (items ?? []) as { transaction_id: string }[]) {
    countByTx.set(it.transaction_id, (countByTx.get(it.transaction_id) ?? 0) + 1);
  }

  const bMap = new Map(((brs ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  const pMap = new Map(((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email]));

  return rows.map((r) => ({
    id: r.id,
    type: r.type,
    status: r.status,
    from_branch: r.from_branch,
    to_branch: r.to_branch,
    from_branch_name: r.from_branch ? (bMap.get(r.from_branch) ?? null) : null,
    to_branch_name: r.to_branch ? (bMap.get(r.to_branch) ?? null) : null,
    note: r.note,
    created_by_email: r.created_by ? (pMap.get(r.created_by) ?? null) : null,
    created_at: r.created_at,
    completed_at: r.completed_at,
    item_count: countByTx.get(r.id) ?? 0,
  }));
}

/** Гүйлгээний сагсанд орох боломжтой (Идэвхтэй) EPC — гол мэдээлэлтэйгээ. */
export interface ActiveEpcItem {
  id: string;
  epc_hex: string;
  serial: number;
  name: string | null;
  sku: string | null;
  gtin: string | null;
  price: number | null;
}

/** Тухайн салбарын БҮХ Идэвхтэй EPC (сагс/жагсаалтад). branchId null = Салбаргүй. */
export async function fetchActiveEpcsByBranch(branchId: string | null): Promise<ActiveEpcItem[]> {
  const PAGE = 1000;
  const out: ActiveEpcItem[] = [];
  for (let from = 0; ; from += PAGE) {
    let q = supabase
      .from("epc_full")
      .select("id, epc_hex, serial, name, sku, gtin, price")
      .eq("status", "active")
      .order("epc_hex", { ascending: true })
      .range(from, from + PAGE - 1);
    q = branchId == null ? q.is("branch_id", null) : q.eq("branch_id", branchId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as ActiveEpcItem[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

/** Гүйлгээ үүсгэнэ (атом RPC). Амжилттай бол transaction id буцаана. */
export async function createTransaction(
  type: TxType,
  toBranch: string | null,
  note: string,
  epcIds: string[]
): Promise<string> {
  const { data, error } = await supabase.rpc("create_transaction", {
    p_type: type,
    p_to_branch: toBranch,
    p_note: note || null,
    p_epc_ids: epcIds,
  });
  if (error) throw error;
  return data as string;
}

/** Хүлээгдэж буй шилжүүлгийг хүлээн авна — EPC очих салбартаа Идэвхтэй болно. */
export async function receiveTransfer(txId: string): Promise<void> {
  const { error } = await supabase.rpc("receive_transfer", { p_tx: txId });
  if (error) throw error;
}

/** Хүлээгдэж буй шилжүүлгийг цуцална — EPC эх салбартаа Идэвхтэй буцна. */
export async function cancelTransfer(txId: string): Promise<void> {
  const { error } = await supabase.rpc("cancel_transfer", { p_tx: txId });
  if (error) throw error;
}

export interface TxItem {
  epc_id: string;
  price: number | null;
  epc_hex: string;
  serial: number;
  name: string | null;
  sku: string | null;
}

/** Нэг гүйлгээний item-үүд (EPC мэдээлэлтэй нь) — дэлгэрэнгүй модалд. */
export async function fetchTxItems(txId: string): Promise<TxItem[]> {
  const { data: items, error } = await supabase
    .from("transaction_items")
    .select("epc_id, price")
    .eq("transaction_id", txId);
  if (error) throw error;
  const list = (items ?? []) as { epc_id: string; price: number | null }[];
  if (list.length === 0) return [];

  const epcs: { id: string; epc_hex: string; serial: number; name: string | null; sku: string | null }[] = [];
  const ids = list.map((i) => i.epc_id);
  for (let i = 0; i < ids.length; i += 300) {
    const { data, error: eErr } = await supabase
      .from("epc_full")
      .select("id, epc_hex, serial, name, sku")
      .in("id", ids.slice(i, i + 300));
    if (eErr) throw eErr;
    epcs.push(...((data ?? []) as typeof epcs));
  }
  const eMap = new Map(epcs.map((e) => [e.id, e]));
  return list
    .map((it) => {
      const e = eMap.get(it.epc_id);
      return {
        epc_id: it.epc_id,
        price: it.price,
        epc_hex: e?.epc_hex ?? "",
        serial: e?.serial ?? 0,
        name: e?.name ?? null,
        sku: e?.sku ?? null,
      };
    })
    .sort((a, b) => a.serial - b.serial);
}
