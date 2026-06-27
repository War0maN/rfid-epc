// ============================================================
// Excel импорт -> бараа (ангилал + шинж чанар) upsert -> Job -> EPC генерац
// Багана (толгойн нэрийг уян хатан таниулна):
//   name     — барааны нэр           (нэр / name / product)
//   sku      — SKU/код               (sku / code / артикул)
//   barcode  — EAN/баркод (GTIN)     (barcode / ean / gtin / баркод)   [сонголт]
//   piece    — тоо ширхэг            (piece / qty / quantity / тоо)    [ЗААВАЛ]
//   box      — хайрцагны дугаар      (box / box no / хайрцаг)          [сонголт]
//   category — ангилал (зам)         (category / ангилал)              [сонголт]
//              зам: "Хувцас / Дээд хувцас" ("/", ">", "|"-ээр салгана)
//   * Бусад БҮХ багана = динамик шинж чанар (Өнгө, Размер, Материал…).
//     Утга нь products.attributes-д {толгой: утга} болж хадгалагдана.
//
// Баркодтой бараа -> SGTIN-96, баркодгүй -> GID-96. Баркодгүй барааны вариант
// бүр (нэр + шинж чанар)-аар давтагдалгүй болж тоологдоно.
// ============================================================
import readXlsxFile from "read-excel-file/universal";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob, type JobLine } from "./generateEpcs";
import { normalizeGtin } from "./epc";
import { ensureCategoriesByPaths, ensureAttributeDefs } from "./catalog";

/**
 * Баркодгүй барааны давтагдалгүй түлхүүр. SKU байвал түүгээр; эс бөгөөс
 * нэр + шинж чанарын утгуудаар (вариант бүр ялгаатай). Юу ч байхгүй бол null.
 */
function extKeyOf(
  name: string | null,
  sku: string | null,
  attributes: Record<string, string>
): string | null {
  if (sku && sku.trim()) return sku.trim().toLowerCase();
  const sig = Object.keys(attributes)
    .sort()
    .map((k) => `${k}=${attributes[k]}`)
    .join("|");
  const base = (name ?? "").trim();
  if (!base && !sig) return null;
  return `${base}·${sig}`.toLowerCase();
}

export interface ImportJobInput {
  jobNumber: string;
  arrivalDate: string; // 'YYYY-MM-DD'
  supplier?: string;
  note?: string;
}

interface CleanRow {
  gtin: string | null;
  extKey: string | null;
  sku: string | null;
  name: string | null;
  piece: number;
  boxNo: string | null;
  categoryPath: string | null;
  attributes: Record<string, string>;
}

interface HeaderMap {
  name: number;
  sku: number;
  barcode: number;
  piece: number;
  box: number;
  category: number;
  attrCols: { idx: number; label: string }[]; // бусад бүх багана = шинж чанар
}

/** Толгойн мөрнөөс багануудыг таниулна (нөөц + динамик шинж чанарын багана). */
function parseHeader(header: unknown[]): HeaderMap {
  const norm = header.map((h) => String(h ?? "").trim());
  const lower = norm.map((s) => s.toLowerCase());
  const find = (cands: string[]) => lower.findIndex((h) => cands.includes(h));

  const name = find(["name", "нэр", "барааны нэр", "product", "бараа"]);
  const sku = find(["sku", "code", "код", "артикул", "article"]);
  const barcode = find(["barcode", "bar code", "ean", "ean13", "gtin", "баркод", "бар код"]);
  const piece = find(["piece", "pieces", "pcs", "qty", "quantity", "count", "тоо", "ширхэг", "тоо ширхэг"]);
  const box = find(["box", "box no", "box_no", "boxno", "box №", "хайрцаг", "хайрцагны дугаар", "хайрцаг №"]);
  const category = find(["category", "categories", "ангилал", "ангиллал", "анги"]);

  const reserved = new Set([name, sku, barcode, piece, box, category].filter((i) => i >= 0));
  const attrCols: { idx: number; label: string }[] = [];
  for (let i = 0; i < norm.length; i++) {
    if (reserved.has(i) || !norm[i]) continue;
    attrCols.push({ idx: i, label: norm[i] });
  }
  return { name, sku, barcode, piece, box, category, attrCols };
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  const v = row[idx];
  return v == null ? "" : String(v).trim();
}

/** Excel файлыг уншиж, цэвэр мөр болгоно. */
async function parseFile(file: Blob): Promise<{ rows: CleanRow[]; skipped: string[] }> {
  const buffer = await file.arrayBuffer();
  const raw = await readXlsxFile(buffer);

  let rows: unknown[][];
  if (Array.isArray(raw) && (raw.length === 0 || Array.isArray(raw[0]))) {
    rows = raw as unknown as unknown[][];
  } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object" && "data" in raw[0]) {
    rows = (raw[0] as { data: unknown[][] }).data;
  } else {
    throw new Error("Excel-ийг уншиж чадсангүй (хүснэгтийн формат таниагдсангүй).");
  }
  if (rows.length < 2) throw new Error("Файлд толгой + дор хаяж нэг мөр байх ёстой.");

  const col = parseHeader(rows[0]);
  if (col.piece < 0) throw new Error("'piece' (тоо ширхэг) багана олдсонгүй.");
  if (col.barcode < 0 && col.sku < 0 && col.name < 0) {
    throw new Error("Барааг таних багана (barcode, sku эсвэл name) олдсонгүй.");
  }

  const out: CleanRow[] = [];
  const skipped: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue; // хоосон мөр

    const rawBarcode = cell(row, col.barcode);
    const sku = cell(row, col.sku) || null;
    const name = cell(row, col.name) || null;
    const categoryPath = cell(row, col.category) || null;

    // Динамик шинж чанарууд (бусад баганаас)
    const attributes: Record<string, string> = {};
    for (const ac of col.attrCols) {
      const v = cell(row, ac.idx);
      if (v) attributes[ac.label] = v;
    }

    // Баркодтой бол GTIN; эс бөгөөс sku/нэр/шинж чанараар таниулна.
    let gtin: string | null = null;
    let extKey: string | null = null;
    if (rawBarcode) {
      try {
        gtin = normalizeGtin(rawBarcode);
      } catch (e) {
        skipped.push(`Мөр ${i + 1}: ${e instanceof Error ? e.message : String(e)}`);
        continue;
      }
    } else {
      extKey = extKeyOf(name, sku, attributes);
      if (!extKey) continue; // таних утгагүй (нийт дүн г.м.) — чимээгүй алгасна
    }

    const piece = parseInt(cell(row, col.piece).replace(/\D/g, ""), 10);
    if (!Number.isFinite(piece) || piece < 1) {
      skipped.push(`Мөр ${i + 1}: piece буруу (${cell(row, col.piece)})`);
      continue;
    }

    out.push({ gtin, extKey, sku, name, piece, boxNo: cell(row, col.box) || null, categoryPath, attributes });
  }
  if (out.length === 0) {
    throw new Error(
      "Импортлох хүчинтэй мөр олдсонгүй." + (skipped.length ? ` (${skipped[0]})` : "")
    );
  }
  return { rows: out, skipped };
}

/** Excel-ийг импортлож, бараа (ангилал+шинж чанар) upsert, Job үүсгэж EPC генерацлэнэ. */
export async function importPackingListXlsx(
  supabase: SupabaseClient,
  file: Blob,
  job: ImportJobInput
) {
  const { rows, skipped } = await parseFile(file);

  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = tenant.id as string;

  // 0) Ангилал болон шинж чанаруудыг автоматаар бүртгэх.
  const catMap = await ensureCategoriesByPaths(
    rows.map((r) => r.categoryPath).filter((p): p is string => !!p)
  );
  const attrLabels = new Set<string>();
  for (const r of rows) for (const k of Object.keys(r.attributes)) attrLabels.add(k);
  await ensureAttributeDefs([...attrLabels]);
  const catId = (r: CleanRow) => (r.categoryPath ? catMap.get(r.categoryPath) ?? null : null);

  // 1) Бараа upsert — хоёр салаагаар (давхцалгүй).
  const idByGtin = new Map<string, string>();
  const idByExtKey = new Map<string, string>();

  const byGtin = new Map<string, CleanRow>();
  const byExtKey = new Map<string, CleanRow>();
  for (const r of rows) {
    if (r.gtin) byGtin.set(r.gtin, r);
    else if (r.extKey) byExtKey.set(r.extKey, r);
  }

  if (byGtin.size > 0) {
    const upserts = [...byGtin.values()].map((r) => ({
      tenant_id: tenantId,
      gtin: r.gtin,
      sku: r.sku,
      name: r.name,
      category_id: catId(r),
      attributes: r.attributes,
      source: "packing_list" as const,
    }));
    const { data, error: uErr } = await supabase
      .from("products")
      .upsert(upserts, { onConflict: "tenant_id,gtin" })
      .select("id, gtin");
    if (uErr) throw uErr;
    for (const p of data as { id: string; gtin: string }[]) idByGtin.set(p.gtin, p.id);
  }

  if (byExtKey.size > 0) {
    const upserts = [...byExtKey.values()].map((r) => ({
      tenant_id: tenantId,
      gtin: null,
      ext_key: r.extKey,
      sku: r.sku,
      name: r.name,
      category_id: catId(r),
      attributes: r.attributes,
      source: "packing_list" as const,
    }));
    const { data, error: uErr } = await supabase
      .from("products")
      .upsert(upserts, { onConflict: "tenant_id,ext_key" })
      .select("id, ext_key");
    if (uErr) throw uErr;
    for (const p of data as { id: string; ext_key: string }[]) idByExtKey.set(p.ext_key, p.id);
  }

  // 2) (product, box) бүрээр тоог нэгтгэх
  const lineMap = new Map<string, JobLine>();
  for (const r of rows) {
    const productId = r.gtin ? idByGtin.get(r.gtin) : r.extKey ? idByExtKey.get(r.extKey) : undefined;
    if (!productId) throw new Error(`бараа олдсонгүй (${r.gtin ?? r.extKey ?? "?"})`);
    const key = `${productId}|${r.boxNo ?? ""}`;
    const existing = lineMap.get(key);
    if (existing) existing.count += r.piece;
    else lineMap.set(key, { productId, count: r.piece, boxNo: r.boxNo });
  }

  // 3) Job үүсгэх
  const { data: jobRow, error: jErr } = await supabase
    .from("jobs")
    .insert({
      tenant_id: tenantId,
      job_number: job.jobNumber,
      arrival_date: job.arrivalDate,
      supplier: job.supplier ?? null,
      note: job.note ?? null,
      status: "draft",
    })
    .select("id")
    .single();
  if (jErr) throw jErr;

  // 4) EPC генерац (allocate -> encode -> insert)
  const epcs = await generateEpcsForJob(supabase, {
    jobId: jobRow.id,
    lines: [...lineMap.values()],
  });

  return {
    jobId: jobRow.id as string,
    totalEpcs: epcs.length,
    productCount: byGtin.size + byExtKey.size,
    boxCount: new Set(rows.map((r) => r.boxNo ?? "")).size,
    categoryCount: catMap.size,
    skippedCount: skipped.length,
    skippedSample: skipped.slice(0, 5),
  };
}
