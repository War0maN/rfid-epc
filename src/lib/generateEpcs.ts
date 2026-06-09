// ============================================================
// Багц EPC үүсгэх бүрэн flow: allocate -> encode -> insert
// Нэг Job дотор олон бараанд EPC үүсгэнэ.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { sgtin96Batch } from "./epc";
import { logAuditEvent } from "./audit";

export interface JobLine {
  productId: string; // products.id
  count: number;     // тоо ширхэг
}

export interface GeneratedEpc {
  productId: string;
  serial: string;    // bigint-г string-ээр (нарийвчлал алдахгүй)
  epcHex: string;
}

/**
 * Тенантын мэдээлэл (prefix, filter)-г нэг удаа татна.
 * RLS-ийн ачаар зөвхөн нэвтэрсэн хэрэглэгчийн тенант буцна.
 */
async function getTenantConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, gs1_company_prefix, default_filter_value")
    .single();
  if (error) throw error;
  return data as { id: string; gs1_company_prefix: string; default_filter_value: number };
}

/**
 * Нэг Job-ийн мөр бүрд:
 *   1) allocate_serials() -> start serial (атом, давхцалгүй)
 *   2) sgtin96Batch()     -> EPC hex багц
 *   3) epc_codes-д insert
 * Бүх EPC-ийг буцаана.
 */
export async function generateEpcsForJob(
  supabase: SupabaseClient,
  params: { jobId: string; lines: JobLine[] }
): Promise<GeneratedEpc[]> {
  const tenant = await getTenantConfig(supabase);
  const filter = tenant.default_filter_value ?? 1;
  const prefixLen = tenant.gs1_company_prefix.length;

  const allRows: {
    tenant_id: string;
    job_id: string;
    product_id: string;
    serial: string;
    epc_hex: string;
  }[] = [];
  const result: GeneratedEpc[] = [];

  for (const line of params.lines) {
    if (line.count < 1) continue;

    // Барааны indicator + item_reference авах
    const { data: product, error: pErr } = await supabase
      .from("products")
      .select("id, indicator, item_reference")
      .eq("id", line.productId)
      .single();
    if (pErr) throw pErr;

    // indicatorItemRef = indicator + item_reference (тэгээр гүйцээсэн)
    const itemDigits = 12 - prefixLen;
    const indicatorItemRef =
      String(product.indicator) +
      String(product.item_reference).replace(/\D/g, "").padStart(itemDigits, "0");

    // 1) Атом serial allocation
    const { data: startData, error: aErr } = await supabase.rpc("allocate_serials", {
      p_tenant: tenant.id,
      p_product: line.productId,
      p_count: line.count,
    });
    if (aErr) throw aErr;
    const startSerial = BigInt(startData as string | number);

    // 2) EPC багц encode
    const batch = sgtin96Batch(
      { companyPrefix: tenant.gs1_company_prefix, indicatorItemRef, filter },
      startSerial,
      line.count
    );

    for (const b of batch) {
      const serialStr = b.serial.toString();
      allRows.push({
        tenant_id: tenant.id,
        job_id: params.jobId,
        product_id: line.productId,
        serial: serialStr,
        epc_hex: b.epcHex,
      });
      result.push({ productId: line.productId, serial: serialStr, epcHex: b.epcHex });
    }
  }

  // 3) Бөөнөөр insert
  if (allRows.length > 0) {
    const { error: iErr } = await supabase.from("epc_codes").insert(allRows);
    if (iErr) throw iErr;
  }

  // Job статус шинэчлэх
  await supabase.from("jobs").update({ status: "generated" }).eq("id", params.jobId);

  // Аудит: хэдэн EPC үүсгэснийг бизнес үйлдэл болгон бичих
  await logAuditEvent(supabase, "generate", "job", params.jobId, { count: result.length });

  return result;
}
