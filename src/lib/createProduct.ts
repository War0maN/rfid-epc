// ============================================================
// Апп дотор бараа үүсгэх (каталог): ангилал + динамик шинж чанартай.
//   Баркодгүй тул EPC нь GID-96 (object_class-ийг trigger автоматаар онооно).
//   Нэг бараа (вариант) + тоо ширхэг → тэр тооны EPC. Бараа бүр нэг Job-д
//   бүлэглэгдэнэ (epc_codes-д job_id шаардлагатай).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob } from "./generateEpcs";
import { ensureAttributeDefs } from "./catalog";
import { normalizeGtin } from "./epc";

export interface ProductInput {
  id?: string; // байвал засна (update); эс бөгөөс шинээр
  categoryId: string | null;
  name: string;
  sku: string | null;
  gtin: string | null; // баркод (байвал SGTIN-96, эс бөгөөс GID-96)
  price: number | null;
  attributes: Record<string, string>; // { "Өнгө": "Улаан", "Размер": "L" }
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

/** Бараа (master) үүсгэх/засах — EPC үүсгэхгүй. productId буцаана. */
export async function upsertCatalogProduct(
  supabase: SupabaseClient,
  input: ProductInput
): Promise<string> {
  const name = input.name.trim();
  if (!name) throw new Error("Барааны нэр оруулна уу.");

  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = (tenant as { id: string }).id;

  await ensureAttributeDefs(Object.keys(input.attributes));

  // Баркод байвал нормчилж шалгана (SGTIN-96); эс бөгөөс GID-96.
  const gtin = input.gtin?.trim() ? normalizeGtin(input.gtin) : null;

  const fields = {
    sku: input.sku?.trim() || null,
    name,
    price: input.price,
    category_id: input.categoryId,
    attributes: input.attributes,
    gtin, // null бол GID-96
    ext_key: gtin ? null : extKeyFor(name, input.sku, input.attributes),
  };

  // Засвар (id өгсөн) бол update; эс бөгөөс upsert (давхцалгүй).
  if (input.id) {
    const { error } = await supabase.from("products").update(fields).eq("id", input.id);
    if (error) throw error;
    return input.id;
  }
  const { data: prod, error: pErr } = await supabase
    .from("products")
    .upsert(
      { tenant_id: tenantId, source: "in_app" as const, ...fields },
      { onConflict: gtin ? "tenant_id,gtin" : "tenant_id,ext_key" }
    )
    .select("id")
    .single();
  if (pErr) throw pErr;
  return (prod as { id: string }).id;
}

/** Тухайн бараанаас quantity ширхэг EPC үүсгэнэ (serial үргэлжилнэ). */
export async function generateEpcsForProduct(
  supabase: SupabaseClient,
  productId: string,
  quantity: number,
  branchId: string | null = null
): Promise<number> {
  if (!Number.isFinite(quantity) || quantity < 1) {
    throw new Error("Тоо ширхэг 1-ээс багагүй байх ёстой.");
  }
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = (tenant as { id: string }).id;

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

  const epcs = await generateEpcsForJob(supabase, {
    jobId: (job as { id: string }).id,
    lines: [{ productId, count: quantity }],
    branchId,
  });
  return epcs.length;
}
