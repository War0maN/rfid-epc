// ============================================================
// Багц EPC үүсгэх бүрэн flow: allocate -> encode -> insert
// Нэг Job дотор олон бараа/хайрцагт EPC үүсгэнэ. EPC-г бараа бүрийн
// GTIN (баркод)-оос шууд (SGTIN-96) үүсгэнэ — брэнд хамаарахгүй.
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { sgtin96BatchFromGtin, gid96Batch } from "./epc";
import { logAuditEvent } from "./audit";

export interface JobLine {
  productId: string;       // products.id
  count: number;           // тоо ширхэг (piece)
  boxNo?: string | null;   // хайрцагны дугаар (box No)
  branchId?: string | null; // салбар (мөр тус бүрд; байхгүй бол default)
}

export interface GeneratedEpc {
  productId: string;
  serial: string;    // bigint-г string-ээр (нарийвчлал алдахгүй)
  epcHex: string;
}

/** Тенант id + default filter + manager_number-г татна (RLS-ээр өөрийн тенант). */
async function getTenantConfig(supabase: SupabaseClient) {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, default_filter_value, manager_number")
    .single();
  if (error) throw error;
  return data as { id: string; default_filter_value: number; manager_number: number | null };
}

/**
 * Job-ийн мөр бүрд:
 *   1) allocate_serials() -> start serial (атом, давхцалгүй, бараа тус бүрд)
 *   2) барааны GTIN-ээс EPC багц encode (SGTIN-96)
 *   3) epc_codes-д box_no-той хамт insert
 */
export async function generateEpcsForJob(
  supabase: SupabaseClient,
  params: { jobId: string; lines: JobLine[]; branchId?: string | null }
): Promise<GeneratedEpc[]> {
  const tenant = await getTenantConfig(supabase);
  const branchId = params.branchId ?? null;
  const filter = tenant.default_filter_value ?? 1;
  const lines = params.lines.filter((l) => l.count >= 1);

  // Барааны GTIN + object_class-ийг нэг удаа татаж map болгоё.
  const productIds = [...new Set(lines.map((l) => l.productId))];
  const { data: products, error: pErr } = await supabase
    .from("products")
    .select("id, gtin, object_class")
    .in("id", productIds);
  if (pErr) throw pErr;
  const prodById = new Map(
    (products as { id: string; gtin: string | null; object_class: number | null }[]).map((p) => [
      p.id,
      p,
    ])
  );

  // 1) Бараа тус бүрийн НИЙТ тоог нэгтгэж, нэг round-trip-ээр serial захиална.
  const totalByProduct = new Map<string, number>();
  for (const l of lines) {
    totalByProduct.set(l.productId, (totalByProduct.get(l.productId) ?? 0) + l.count);
  }
  const items = [...totalByProduct.entries()].map(([product_id, count]) => ({ product_id, count }));
  const { data: starts, error: aErr } = await supabase.rpc("allocate_serials_bulk", {
    p_tenant: tenant.id,
    p_items: items,
  });
  if (aErr) throw aErr;
  // { productId: startSerial } -> бараа тус бүрийн дараагийн serial
  const nextSerial = new Map<string, bigint>();
  for (const [pid, s] of Object.entries(starts as Record<string, string | number>)) {
    nextSerial.set(pid, BigInt(s));
  }

  // 2) Мөр (хайрцаг) бүрд serial-ийг дарааллаар нь зарцуулж EPC encode.
  const allRows: {
    tenant_id: string;
    job_id: string;
    product_id: string;
    box_no: string | null;
    branch_id: string | null;
    serial: string;
    epc_hex: string;
  }[] = [];
  const result: GeneratedEpc[] = [];

  for (const line of lines) {
    const prod = prodById.get(line.productId);
    if (!prod) throw new Error(`бараа ${line.productId}: олдсонгүй`);
    const serial = nextSerial.get(line.productId);
    if (serial == null) throw new Error(`бараа ${line.productId}: serial захиалга алга`);

    // GTIN (баркод) байвал SGTIN-96; байхгүй бол GID-96 (GS1-гүй дотоод код).
    const hasGtin = !!prod.gtin && prod.gtin.trim() !== "";
    let batch: { serial: bigint; epcHex: string }[];
    if (hasGtin) {
      batch = sgtin96BatchFromGtin(prod.gtin as string, serial, line.count, filter);
    } else {
      if (prod.object_class == null) {
        throw new Error(`бараа ${line.productId}: object_class алга (GID-96 кодлоход шаардлагатай)`);
      }
      if (tenant.manager_number == null) {
        throw new Error("Тенантад manager_number тохируулаагүй (GID-96 кодлоход шаардлагатай)");
      }
      batch = gid96Batch(
        { managerNumber: tenant.manager_number, objectClass: prod.object_class },
        serial,
        line.count
      );
    }
    nextSerial.set(line.productId, serial + BigInt(line.count));

    for (const b of batch) {
      const serialStr = b.serial.toString();
      allRows.push({
        tenant_id: tenant.id,
        job_id: params.jobId,
        product_id: line.productId,
        box_no: line.boxNo ?? null,
        branch_id: line.branchId ?? branchId,
        serial: serialStr,
        epc_hex: b.epcHex,
      });
      result.push({ productId: line.productId, serial: serialStr, epcHex: b.epcHex });
    }
  }

  // 3) Бөөнөөр, хэсэгчлэн insert (том payload-аас зайлсхийх).
  const CHUNK = 1000;
  for (let i = 0; i < allRows.length; i += CHUNK) {
    const { error: iErr } = await supabase.from("epc_codes").insert(allRows.slice(i, i + CHUNK));
    if (iErr) throw iErr;
  }

  await supabase.from("jobs").update({ status: "generated" }).eq("id", params.jobId);
  await logAuditEvent(supabase, "generate", "job", params.jobId, { count: result.length });

  return result;
}
