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
  | "print"
  | "status_change"
  | "export_csv"
  | "export_zpl";

export interface AuditRow {
  id: string;
  actor_id: string | null;
  actor_email: string | null; // үйлдэл хийсэн хэрэглэгчийн имэйл (profiles-оос)
  action: string;
  entity: string;
  entity_id: string | null;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  meta: Record<string, unknown> | null;
  created_at: string;
}

/**
 * Бөөн EPC үйлдлийн (устгах/хэвлэх/төлөв солих) дэлгэрэнгүй meta:
 * бараагаар задаргаа + эхний 100 EPC hex — аудитын дэлгэрэнгүйд
 * "яг аль барааны ямар EPC" гэдгийг харуулна.
 */
export function epcBulkMeta(
  rows: { epc_hex: string; name: string | null; sku: string | null }[]
): Record<string, unknown> {
  const byProduct: Record<string, number> = {};
  for (const r of rows) {
    const key = r.name || r.sku || "Нэргүй бараа";
    byProduct[key] = (byProduct[key] ?? 0) + 1;
  }
  const CAP = 100;
  return {
    count: rows.length,
    byProduct,
    epcs: rows.slice(0, CAP).map((r) => r.epc_hex),
    epcsTruncated: rows.length > CAP,
  };
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

/** Аудит логийг шинэ нь эхэнд татна (actor_id-г имэйлээр баяжуулна). */
export async function fetchAuditLog(limit = 200): Promise<AuditRow[]> {
  const { data, error } = await supabase
    .from("audit_log")
    .select("id, actor_id, action, entity, entity_id, before, after, meta, created_at")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  const rows = (data ?? []) as AuditRow[];

  // actor_id -> имэйл (RLS-ийн ачаар зөвхөн өөрийн тенантын гишүүд харагдана).
  const { data: profs } = await supabase.from("profiles").select("id, email");
  const emailById = new Map(
    ((profs ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email])
  );
  for (const r of rows) r.actor_email = r.actor_id ? emailById.get(r.actor_id) ?? null : null;
  return rows;
}
