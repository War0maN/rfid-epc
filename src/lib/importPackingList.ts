// ============================================================
// Excel packing list импорт -> бараа upsert -> Job -> EPC генерац
// Багана (толгойн нэрийг уян хатан таниулна):
//   name    — барааны нэр            (нэр / name / product)
//   sku     — нийлүүлэгчийн SKU/код   (sku / code / артикул)
//   barcode — EAN/баркод (GTIN)      (barcode / ean / gtin / баркод)   [сонголт]
//   piece   — тоо ширхэг             (piece / qty / quantity / тоо)    [ЗААВАЛ]
//   box     — хайрцагны дугаар       (box / box no / хайрцаг)          [сонголт]
// Баркодтой бараа -> SGTIN-96, баркодгүй бараа -> GID-96 (GS1-гүй).
// Баркодгүй барааг sku (эс бөгөөс нэр)-ээр давтагдалгүй болгож тоолно.
// Нэг бараа олон хайрцагт орж болно — (бараа, box) бүр тусдаа мөр болж,
// EPC-д харгалзах box_no хадгалагдана (шошго наахад мөшгих).
// ============================================================
import readXlsxFile from "read-excel-file/universal";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateEpcsForJob, type JobLine } from "./generateEpcs";
import { normalizeGtin } from "./epc";

/** Баркодгүй барааны давтагдалгүй түлхүүр (sku эс бөгөөс нэр), нормчилсон. */
function extKeyOf(sku: string | null, name: string | null): string | null {
  const k = (sku ?? name ?? "").trim().toLowerCase();
  return k || null;
}

export interface ImportJobInput {
  jobNumber: string;
  arrivalDate: string; // 'YYYY-MM-DD'
  supplier?: string;
  note?: string;
}

interface CleanRow {
  gtin: string | null;   // нормчилсон (14 орон) GTIN, эсвэл null (баркодгүй)
  extKey: string | null; // баркодгүй үед давтагдалгүй түлхүүр (sku/нэр)
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
async function parseFile(file: Blob): Promise<{ rows: CleanRow[]; skipped: string[] }> {
  // File-ийг өөрсдөө ArrayBuffer болгож уншина (браузерын FileReader-ийн
  // "could not be read" алдаанаас зайлсхийнэ).
  const buffer = await file.arrayBuffer();
  const raw = await readXlsxFile(buffer);

  // read-excel-file нь зарим тохиолдолд мөрийн массив, заримд [{sheet, data}]
  // хэлбэрээр буцаадаг — хоёуланг зохицуулна (эхний sheet-ийг авна).
  let rows: unknown[][];
  if (Array.isArray(raw) && (raw.length === 0 || Array.isArray(raw[0]))) {
    rows = raw as unknown as unknown[][];
  } else if (Array.isArray(raw) && raw[0] && typeof raw[0] === "object" && "data" in raw[0]) {
    rows = (raw[0] as { data: unknown[][] }).data;
  } else {
    throw new Error("Excel-ийг уншиж чадсангүй (хүснэгтийн формат таниагдсангүй).");
  }
  if (rows.length < 2) throw new Error("Файлд толгой + дор хаяж нэг мөр байх ёстой.");

  const col = columnIndexes(rows[0]);
  if (col.piece < 0) throw new Error("'piece' (тоо ширхэг) багана олдсонгүй.");
  if (col.barcode < 0 && col.sku < 0 && col.name < 0) {
    throw new Error("Барааг таних багана (barcode, sku эсвэл name) олдсонгүй.");
  }

  // Алдаатай/хоосон мөрийг алгасаад үргэлжилнэ (нэг муу мөр бүх импортыг
  // зогсоохгүй). Алгассан тоо/шалтгааныг буцааж UI-д харуулна.
  const out: CleanRow[] = [];
  const skipped: string[] = [];
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.every((c) => c == null || String(c).trim() === "")) continue; // хоосон мөр

    const rawBarcode = cell(row, col.barcode);
    const sku = cell(row, col.sku) || null;
    const name = cell(row, col.name) || null;

    // Баркодтой бол GTIN болгож шалгана; баркодгүй бол sku/нэрээр таниулна.
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
      extKey = extKeyOf(sku, name);
      if (!extKey) continue; // баркод ч, нэр/sku ч алга (нийт дүн г.м.) — чимээгүй алгасна
    }

    const piece = parseInt(cell(row, col.piece).replace(/\D/g, ""), 10);
    if (!Number.isFinite(piece) || piece < 1) {
      skipped.push(`Мөр ${i + 1}: piece буруу (${cell(row, col.piece)})`);
      continue;
    }

    out.push({
      gtin,
      extKey,
      sku,
      name,
      piece,
      boxNo: cell(row, col.box) || null,
    });
  }
  if (out.length === 0) {
    throw new Error(
      "Импортлох хүчинтэй мөр олдсонгүй." + (skipped.length ? ` (${skipped[0]})` : "")
    );
  }
  return { rows: out, skipped };
}

/** Excel packing list-ийг импортлож, бараа upsert, Job үүсгэж EPC генерацлэнэ. */
export async function importPackingListXlsx(
  supabase: SupabaseClient,
  file: Blob,
  job: ImportJobInput
) {
  const { rows, skipped } = await parseFile(file);

  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const tenantId = tenant.id as string;

  // 1) Бараа upsert — хоёр салаагаар (давхцалгүй):
  //    a) GTIN-тэй бараа — onConflict (tenant_id, gtin), SGTIN-96 кодлоно.
  //    b) Баркодгүй бараа — onConflict (tenant_id, ext_key), GID-96 кодлоно.
  //    upsert-ийн буцаасан мөрийг шууд ашиглаж түлхүүр -> id map үүсгэнэ.
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
      source: "packing_list" as const,
    }));
    const { data, error: uErr } = await supabase
      .from("products")
      .upsert(upserts, { onConflict: "tenant_id,ext_key" })
      .select("id, ext_key");
    if (uErr) throw uErr;
    for (const p of data as { id: string; ext_key: string }[]) idByExtKey.set(p.ext_key, p.id);
  }

  // 3) (product, box) бүрээр тоог нэгтгэх
  const lineMap = new Map<string, JobLine>();
  for (const r of rows) {
    const productId = r.gtin ? idByGtin.get(r.gtin) : r.extKey ? idByExtKey.get(r.extKey) : undefined;
    if (!productId) throw new Error(`бараа олдсонгүй (${r.gtin ?? r.extKey ?? "?"})`);
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
    productCount: byGtin.size + byExtKey.size,
    boxCount: new Set(rows.map((r) => r.boxNo ?? "")).size,
    skippedCount: skipped.length,
    skippedSample: skipped.slice(0, 5),
  };
}
