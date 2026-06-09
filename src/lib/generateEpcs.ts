// ============================================================
// Багц EPC үүсгэх бүрэн flow: allocate -> encode -> insert
// Нэг Job дотор олон бараа/хайрцагт EPC үүсгэнэ. EPC-г бараа бүрийн
// GTIN (баркод)-оос шууд (SGTIN-96) үүсгэнэ — брэнд хамаарахгүй.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { sgtin96BatchFromGtin } from "./epc";
import { logAuditEvent } from "./audit";

export interface JobLine {
  productId: string;     // products.id
  count: number;         // тоо ширхэг (piece)
  boxNo?: string | null; // хайрцагны дугаар (box No)
}

export interface GeneratedEpc {
  productId: string;
  serial: string;    // bigint-г string-ээр (нарийвчлал алдахгүй)
  epcHex: string;
}

/** Тенант id + default filter-г нэг удаа татна (RLS-ээр зөвхөн өөрийн тенант). */
async function getTenantConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, default_filter_value")
    .single();
  if (error) throw error;
  return data as { id: string; default_filter_value: number };
}

/**
 * Job-ийн мөр бүрд:
 *   1) allocate_serials() -> start serial (атом, давхцалгүй, бараа тус бүрд)
 *   2) барааны GTIN-ээс EPC багц encode (SGTIN-96)
 *   3) epc_codes-д box_no-той хамт insert
 */
export async function generateEpcsForJob(
  supabase: SupabaseClient,
  params: { jobId: string; lines: JobLine[] }
): Promise<GeneratedEpc[]> {
  const tenant = await getTenantConfig(supabase);
  const filter = tenant.default_filter_value ?? 1;

  // Барааны GTIN-уудыг нэг удаа татаж map болгоё.
  const productIds = [...new Set(params.lines.map((l) => l.productId))];
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, gtin")
    .in("id", productIds);
  if (pErr) throw pErr;
  const gtinById = new Map(
    (products as { id: string; gtin: string }[]).map((p) => [p.id, p.gtin])
  );

  const allRows: {
    tenant_id: string;
    job_id: string;
    product_id: string;
    box_no: string | null;
    serial: string;
    epc_hex: string;
  }[] = [];
  const result: GeneratedEpc[] = [];

  for (const line of params.lines) {
    if (line.count < 1) continue;
    const gtin = gtinById.get(line.productId);
    if (!gtin) throw new Error(`бараа ${line.productId}: GTIN олдсонгүй`);

    // 1) Атом serial allocation (бараа тус бүрд, бүх хайрцгийн дунд давхцахгүй)
    const { data: startData, error: aErr } = await supabase.rpc("allocate_serials", {
      p_tenant: tenant.id,
      p_product: line.productId,
      p_count: line.count,
    });
    if (aErr) throw aErr;
    const startSerial = BigInt(startData as string | number);

    // 2) GTIN-ээс EPC багц encode
    const batch = sgtin96BatchFromGtin(gtin, startSerial, line.count, filter);

    for (const b of batch) {
      const serialStr = b.serial.toString();
      allRows.push({
        tenant_id: tenant.id,
        job_id: params.jobId,
        product_id: line.productId,
        box_no: line.boxNo ?? null,
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

  await supabase.from("jobs").update({ status: "generated" }).eq("id", params.jobId);
  await logAuditEvent(supabase, "generate", "job", params.jobId, { count: result.length });

  return result;
}
