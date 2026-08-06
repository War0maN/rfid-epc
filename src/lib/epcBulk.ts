// EPC-ийн бөөн үйлдлүүд (шинэ EpcDataTable ашиглана) — хуучин EpcTable-ийн
// шалгагдсан логикийн lib-хувилбар: mark_printed / change_epc_status RPC +
// аудит (epcBulkMeta), устгал зөвхөн Хэвлээгүй + гүйлгээний түүхгүйг.
import { supabase } from "./supabaseClient";
import { logAuditEvent, epcBulkMeta } from "./audit";
import type { EpcRow } from "./queries";
import type { EpcStatus } from "./epcStatus";

/** Хэвлэгдсэнд тооцно (mark_printed RPC — print_count++, Хэвлээгүй → Идэвхтэй). */
export async function markPrintedBulk(rows: EpcRow[]): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.rpc("mark_printed", { p_ids: ids.slice(i, i + 500) });
    if (error) throw error;
  }
  void logAuditEvent(supabase, "print", "epc", null, epcBulkMeta(rows));
}

/** Төлөв өөрчилнө (change_epc_status RPC — тэмдэглэл нь EPC бүрийн түүхэнд). */
export async function changeStatusBulk(rows: EpcRow[], target: EpcStatus, note: string): Promise<void> {
  if (rows.length === 0) return;
  const ids = rows.map((r) => r.id);
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.rpc("change_epc_status", {
      p_ids: ids.slice(i, i + 500),
      p_status: target,
      p_reason: note.trim() || null,
    });
    if (error) throw error;
  }
  void logAuditEvent(supabase, "status_change", "epc", null, {
    ...epcBulkMeta(rows),
    status: target,
    note: note.trim() || undefined,
  });
}

export interface DeleteResult {
  deleted: number;
  /** Хэвлээгүй биш тул алгассан. */
  skippedStatus: number;
  /** Гүйлгээний түүхтэй тул алгассан (устгавал түүх тасарна). */
  skippedHistory: number;
}

/** Зөвхөн Хэвлээгүй, гүйлгээний түүхгүй EPC-үүдийг устгана (DB trigger давхар хамгаална). */
export async function deleteUnprintedBulk(rows: EpcRow[]): Promise<DeleteResult> {
  const deletable = rows.filter((r) => r.status === "unprinted");
  const skippedStatus = rows.length - deletable.length;
  const candidateIds = deletable.map((r) => r.id);
  const withHistory = new Set<string>();
  for (let i = 0; i < candidateIds.length; i += 300) {
    const { data, error } = await supabase
      .from("transaction_items")
      .select("epc_id")
      .in("epc_id", candidateIds.slice(i, i + 300));
    if (error) throw error;
    for (const r of (data ?? []) as { epc_id: string }[]) withHistory.add(r.epc_id);
  }
  const ids = candidateIds.filter((id) => !withHistory.has(id));
  for (let i = 0; i < ids.length; i += 500) {
    const { error } = await supabase.from("epc_codes").delete().in("id", ids.slice(i, i + 500));
    if (error) throw error;
  }
  if (ids.length > 0) {
    const idSet = new Set(ids);
    void logAuditEvent(supabase, "delete", "epc", null,
      epcBulkMeta(deletable.filter((r) => idSet.has(r.id))));
  }
  return { deleted: ids.length, skippedStatus, skippedHistory: withHistory.size };
}
