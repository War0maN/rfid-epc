// ============================================================
// Audit log — бизнес үйлдэл бичих (RPC) ба лог унших.
//   * Бичилт: log_audit_event() security-definer функцээр (actor/tenant-г
//     сервер тал тогтооно). Алдаа гарвал үндсэн урсгалыг ЗОГСООХГҮЙ —
//     audit нь хоёрдогч.
//   * Унших: RLS-ийн ачаар зөвхөн өөрийн тенантын лог буцна.
// jobs/products/tenants дээрх өөрчлөлтийг DB trigger автоматаар бичдэг тул
// энд зөвхөн "generate", "export_*" зэрэг апп үйлдлийг бичнэ.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";

export type AuditAction =
  | "insert"
  | "update"
  | "delete"
  | "generate"
  | "export_csv"
  | "export_zpl";

export interface AuditRow {
  id: string;
  actor_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Бизнес үйлдлийг логлоно. Алдааг зөвхөн consol-д бичээд залгидаг —
 * лог амжилтгүй болсон ч үндсэн үйлдэл (EPC үүсгэх/export) тасрахгүй.
 */
export async function logAuditEvent(
  client: SupabaseClient,
  action: AuditAction,
  entity: string,
  entityId: string | null,
  meta?: Record<string, unknown>
): Promise<void> {
  const { error } = await client.rpc("log_audit_event", {
    p_action: action,
    p_entity: entity,
    p_entity_id: entityId,
    p_meta: meta ?? null,
  });
  if (error) console.warn("audit log бичих амжилтгүй:", error.message);
}

/** Аудит логийг шинэ нь эхэнд татна. */
export async function fetchAuditLog(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, before, after, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as AuditRow[];
}
