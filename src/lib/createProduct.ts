// ============================================================
// Апп дотор бараа үүсгэх (каталог): ангилал + динамик шинж чанартай.
//   Баркодгүй тул EPC нь GID-96 (object_class-ийг trigger автоматаар онооно).
//   Нэг бараа (вариант) + тоо ширхэг → тэр тооны EPC. Бараа бүр нэг Job-д
//   бүлэглэгдэнэ (epc_codes-д job_id шаардлагатай).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob } from "./generateEpcs";

export interface CreateCatalogProductInput {
  categoryId: string | null;
  name: string;
  sku: string | null;
  attributes: Record<string, string>; // { "Өнгө": "Улаан", "Размер": "L" }
  quantity: number;
}

/**
 * Баркодгүй барааны давтагдалгүй түлхүүр. SKU байвал түүгээр; эс бөгөөс
 * нэр + шинж чанарын утгуудаар (вариант бүр ялгаатай болно).
 */
function extKeyFor(name: string, sku: string | null, attributes: Record<string, string>): string {
  if (sku && sku.trim()) return sku.trim().toLowerCase();
  const sig = Object.keys(attributes)
    .sort()
    .map((k) => `${k}=${attributes[k]}`)
    .join("|");
  return `${name.trim()}·${sig}`.toLowerCase();
}

export async function createCatalogProductAndEpcs(
  supabase: SupabaseClient,
  input: CreateCatalogProductInput
): Promise<{ productId: string; jobId: string; count: number }> {
  const name = input.name.trim();
  if (!name) throw new Error("Барааны нэр оруулна уу.");
  if (!Number.isFinite(input.quantity) || input.quantity < 1) {
    throw new Error("Тоо ширхэг 1-ээс багагүй байх ёстой.");
  }

  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = (tenant as { id: string }).id;

  // 1) Бараа upsert (баркодгүй → GID-96). object_class-ийг DB trigger онооно.
  const extKey = extKeyFor(name, input.sku, input.attributes);
  const { data: prod, error: pErr } = await supabase
    .from("products")
    .upsert(
      {
        tenant_id: tenantId,
        gtin: null,
        ext_key: extKey,
        sku: input.sku?.trim() || null,
        name,
        category_id: input.categoryId,
        attributes: input.attributes,
        source: "in_app" as const,
      },
      { onConflict: "tenant_id,ext_key" }
    )
    .select("id")
    .single();
  if (pErr) throw pErr;
  const productId = (prod as { id: string }).id;

  // 2) Job үүсгэх (бараа үүсгэх багц бүр нэг Job).
  const now = new Date();
  const jobNumber = `БАР-${now.getTime().toString(36).toUpperCase()}`;
  const { data: job, error: jErr } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      job_number: jobNumber,
      arrival_date: now.toISOString().slice(0, 10),
      note: "Каталог бараа",
      status: "draft",
    })
    .select("id")
    .single();
  if (jErr) throw jErr;
  const jobId = (job as { id: string }).id;

  // 3) EPC генерац (GID-96, тоо ширхгээр).
  const epcs = await generateEpcsForJob(supabase, {
    jobId,
    lines: [{ productId, count: input.quantity }],
  });

  return { productId, jobId, count: epcs.length };
}
