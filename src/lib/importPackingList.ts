// ============================================================
// Excel packing list импорт -> бараа upsert (GTIN-ээр) -> Job -> EPC генерац
// Багана (толгойн нэрийг уян хатан таниулна):
//   name    — барааны нэр            (нэр / name / product)
//   sku     — нийлүүлэгчийн SKU/код   (sku / code / артикул)
//   barcode — EAN/баркод (GTIN)      (barcode / ean / gtin / баркод)   [ЗААВАЛ]
//   piece   — тоо ширхэг             (piece / qty / quantity / тоо)    [ЗААВАЛ]
//   box     — хайрцагны дугаар       (box / box no / хайрцаг)          [сонголт]
// Нэг GTIN олон хайрцагт орж болно — (GTIN, box) бүр тусдаа мөр болж,
// EPC-д харгалзах box_no хадгалагдана (шошго наахад мөшгих).
// ============================================================
import readXlsxFile from "read-excel-file/universal";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob, type JobLine } from "./generateEpcs";
import { normalizeGtin } from "./epc";

export interface ImportJobInput {
  jobNumber: string;
  arrivalDate: string; // 'YYYY-MM-DD'
  supplier?: string;
  note?: string;
}

interface CleanRow {
  gtin: string;          // нормчилсон (14 орон) GTIN
  rawBarcode: string;
  sku: string | null;
  name: string | null;
  piece: number;
  boxNo: string | null;
}

/** Толгойн мөрнөөс багана бүрийн индексийг (уян хатан) олно. */
function columnIndexes(header: unknown[]): Record<string, number> {
  const norm = header.map((h) => String(h ?? "").trim().toLowerCase());
  const find = (cands: string[]) => norm.findIndex((h) => cands.includes(h));
  return {
    name: find(["name", "нэр", "барааны нэр", "product", "бараа"]),
    sku: find(["sku", "code", "код", "артикул", "article"]),
    barcode: find(["barcode", "bar code", "ean", "ean13", "gtin", "баркод", "бар код"]),
    piece: find(["piece", "pieces", "pcs", "qty", "quantity", "count", "тоо", "ширхэг", "тоо ширхэг"]),
    box: find(["box", "box no", "box_no", "boxno", "box №", "хайрцаг", "хайрцагны дугаар", "хайрцаг №"]),
  };
}

function cell(row: unknown[], idx: number): string {
  if (idx < 0) return "";
  const v = row[idx];
  return v == null ? "" : String(v).trim();
}

/** Excel файлыг уншиж, цэвэр мөр болгож, GTIN-ийг шалгана. */
async function parseFile(file: Blob): Promise<CleanRow[]> {
  const rows = (await readXlsxFile(file)) as unknown as unknown[][];
  if (rows.length < 2) throw new Error("Файлд толгой + дор хаяж нэг мөр байх ёстой.");

  const col = columnIndexes(rows[0]);
  if (col.barcode < 0) throw new Error("'barcode' (EAN/GTIN) багана олдсонгүй.");
  if (col.piece < 0) throw new Error("'piece' (тоо ширхэг) багана олдсонгүй.");

  const out: CleanRow[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue; // хоосон мөр

    const rawBarcode = cell(row, col.barcode);
    if (!rawBarcode) throw new Error(`Мөр ${i + 1}: barcode хоосон байна.`);
    let gtin: string;
    try {
      gtin = normalizeGtin(rawBarcode);
    } catch (e) {
      throw new Error(`Мөр ${i + 1}: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    }

    const piece = parseInt(cell(row, col.piece).replace(/\D/g, ""), 10);
    if (!Number.isFinite(piece) || piece < 1) {
      throw new Error(`Мөр ${i + 1}: piece буруу (${cell(row, col.piece)}).`);
    }

    out.push({
      gtin,
      rawBarcode,
      sku: cell(row, col.sku) || null,
      name: cell(row, col.name) || null,
      piece,
      boxNo: cell(row, col.box) || null,
    });
  }
  if (out.length === 0) throw new Error("Импортлох мөр олдсонгүй.");
  return out;
}

/** Excel packing list-ийг импортлож, бараа upsert, Job үүсгэж EPC генерацлэнэ. */
export async function importPackingListXlsx(
  supabase: SupabaseClient,
  file: Blob,
  job: ImportJobInput
) {
  const rows = await parseFile(file);

  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = tenant.id as string;

  // 1) Бараа upsert (GTIN-ээр давхцалгүй). Нэр/SKU-г сүүлийн утгаар шинэчилнэ.
  const byGtin = new Map<string, CleanRow>();
  for (const r of rows) byGtin.set(r.gtin, r); // GTIN бүрийн нэг төлөөлөл (нэр/sku)
  const upserts = [...byGtin.values()].map((r) => ({
    tenant_id: tenantId,
    gtin: r.gtin,
    sku: r.sku,
    name: r.name,
    source: "packing_list" as const,
  }));
  const { error: uErr } = await supabase
    .from("products")
    .upsert(upserts, { onConflict: "tenant_id,gtin" });
  if (uErr) throw uErr;

  // 2) GTIN -> product.id map
  const { data: products, error: gErr } = await supabase
    .from("products")
    .select("id, gtin")
    .in("gtin", [...byGtin.keys()]);
  if (gErr) throw gErr;
  const idByGtin = new Map(
    (products as { id: string; gtin: string }[]).map((p) => [p.gtin, p.id])
  );

  // 3) (product, box) бүрээр тоог нэгтгэх
  const lineMap = new Map<string, JobLine>();
  for (const r of rows) {
    const productId = idByGtin.get(r.gtin);
    if (!productId) throw new Error(`бараа олдсонгүй (GTIN ${r.gtin})`);
    const key = `${productId}|${r.boxNo ?? ""}`;
    const existing = lineMap.get(key);
    if (existing) existing.count += r.piece;
    else lineMap.set(key, { productId, count: r.piece, boxNo: r.boxNo });
  }

  // 4) Job үүсгэх
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

  // 5) EPC генерац (allocate -> encode -> insert, box_no-той)
  const epcs = await generateEpcsForJob(supabase, {
    jobId: jobRow.id,
    lines: [...lineMap.values()],
  });

  return {
    jobId: jobRow.id as string,
    totalEpcs: epcs.length,
    productCount: byGtin.size,
    boxCount: new Set(rows.map((r) => r.boxNo ?? "")).size,
  };
}
