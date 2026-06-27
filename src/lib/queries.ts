// ============================================================
// Supabase унших query-ууд: EPC хүснэгт (бүх мөр) ба EPC hex-ээр буцаах
// хайлт. RLS-ийн ачаар бүгд тенантаар хязгаарлагдана.
//
// Гүйцэтгэл: epc_codes-г JOIN-гүйгээр хавтгай татаж, жижиг products/jobs
// хүснэгтийг нэг удаа аваад JS дотор холбоно. Хуудаслалт нь offset биш
// keyset (id > сүүлийн) тул олон мянган мөрд ч хурдан.
// ============================================================
import { supabase } from "./supabaseClient";

/** EPC хүснэгтийн нэг мөр (products/jobs-ийн талбарууд хавтгайгаар нэгдсэн). */
export interface EpcRow {
  id: string;
  serial: number;
  epc_hex: string;
  box_no: string | null;
  created_at: string;
  printed_at: string | null; // хэвлэсэн огноо (null бол хэвлээгүй)
  job_id: string;
  product_id: string;
  name: string | null;
  gtin: string;
  sku: string | null;
  category_id: string | null;
  category_name: string | null;
  attributes: Record<string, string>; // {"Өнгө":"Улаан","Размер":"L"}
  attributes_text: string | null; // хайх/харуулах текст
  job_number: string | null;
  arrival_date: string | null;
  supplier: string | null;
}

interface ProductLite {
  id: string;
  name: string | null;
  gtin: string;
  sku: string | null;
  category_id: string | null;
  attributes: Record<string, string> | null;
}
interface JobLite {
  id: string;
  job_number: string;
  arrival_date: string;
  supplier: string | null;
}

/** Шинж чанарын объектыг харуулах текст болгоно ("Өнгө: Улаан · Размер: L"). */
function attrsToText(attrs: Record<string, string>): string {
  return Object.keys(attrs)
    .sort()
    .map((k) => `${k}: ${attrs[k]}`)
    .join(" · ");
}

/** products + jobs + categories-ийг нэг удаа татаж lookup map болгоно. */
async function fetchLookupMaps() {
  const [{ data: prods, error: pErr }, { data: jobs, error: jErr }, { data: cats, error: cErr }] =
    await Promise.all([
      supabase.from("products").select("id, name, gtin, sku, category_id, attributes"),
      supabase.from("jobs").select("id, job_number, arrival_date, supplier"),
      supabase.from("categories").select("id, name"),
    ]);
  if (pErr) throw pErr;
  if (jErr) throw jErr;
  if (cErr) throw cErr;
  const pMap = new Map((prods as ProductLite[]).map((p) => [p.id, p]));
  const jMap = new Map((jobs as JobLite[]).map((j) => [j.id, j]));
  const cMap = new Map((cats as { id: string; name: string }[]).map((c) => [c.id, c.name]));
  return { pMap, jMap, cMap };
}

interface FlatEpc {
  id: string;
  serial: number;
  epc_hex: string;
  box_no: string | null;
  created_at: string;
  printed_at: string | null;
  job_id: string;
  product_id: string;
}

function joinRow(
  r: FlatEpc,
  pMap: Map<string, ProductLite>,
  jMap: Map<string, JobLite>,
  cMap: Map<string, string>
): EpcRow {
  const p = pMap.get(r.product_id);
  const j = jMap.get(r.job_id);
  const attributes = p?.attributes ?? {};
  return {
    ...r,
    name: p?.name ?? null,
    gtin: p?.gtin ?? "",
    sku: p?.sku ?? null,
    category_id: p?.category_id ?? null,
    category_name: p?.category_id ? (cMap.get(p.category_id) ?? null) : null,
    attributes,
    attributes_text: attrsToText(attributes),
    job_number: j?.job_number ?? null,
    arrival_date: j?.arrival_date ?? null,
    supplier: j?.supplier ?? null,
  };
}

const FLAT_SELECT = "id, serial, epc_hex, box_no, created_at, printed_at, job_id, product_id";

/**
 * Бүх EPC-г татна (1000-ийн хязгааргүй). epc_codes-г JOIN-гүй хавтгай,
 * keyset (id-ээр) хуудаслалтаар татаад products/jobs-той JS дотор холбоно.
 */
export async function fetchAllEpcs(): Promise<EpcRow[]> {
  const { pMap, jMap, cMap } = await fetchLookupMaps();

  // Supabase нэг хүсэлтэд дээд тал нь 1000 мөр буцаадаг (default cap) тул
  // PAGE-г 1000 болгоно. Бүрэн хуудас (=1000) ирвэл цааш үргэлжилнэ.
  const PAGE = 1000;
  const all: EpcRow[] = [];
  let lastId = "";
  for (;;) {
    let q = supabase
      .from("epc_codes")
      .select(FLAT_SELECT)
      .order("id", { ascending: true })
      .limit(PAGE);
    if (lastId) q = q.gt("id", lastId);
    const { data, error } = await q;
    if (error) throw error;
    const rows = (data ?? []) as FlatEpc[];
    for (const r of rows) all.push(joinRow(r, pMap, jMap, cMap));
    if (rows.length < PAGE) break;
    lastId = rows[rows.length - 1].id;
  }
  return all;
}

/** Нэг EPC hex-ээр буцаах хайлт. Олдоогүй бол null. */
export async function lookupEpc(epcHex: string): Promise<EpcRow | null> {
  const { data, error } = await supabase
    .from("epc_codes")
    .select(FLAT_SELECT)
    .eq("epc_hex", epcHex)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { pMap, jMap, cMap } = await fetchLookupMaps();
  return joinRow(data as FlatEpc, pMap, jMap, cMap);
}

// ============================================================
// Server-side хуудаслалт / хайлт / эрэмбэ (epc_full view дээр).
//   Зөвхөн харагдах хуудсыг татна — олон мянган мөртэй ч хурдан.
// ============================================================

export interface EpcSort {
  key: string;
  dir: "asc" | "desc";
}

export interface EpcPage {
  rows: EpcRow[];
  total: number;
}

/** Хүснэгтийн баганын түлхүүр → DB баганын нэр. */
const COL_TO_DB: Record<string, string> = {
  epc: "epc_hex",
  serial: "serial",
  printed: "printed_at",
  name: "name",
  sku: "sku",
  gtin: "gtin",
  category: "category_name",
  attr: "attributes_text",
  box: "box_no",
  job: "job_number",
  date: "arrival_date",
  supplier: "supplier",
};

/** epc_full дээрх select-д баганын шүүлтүүдийг хэрэглэнэ. */
type EpcQuery = ReturnType<typeof epcBase>;
function epcBase(withCount: boolean) {
  return withCount
    ? supabase.from("epc_full").select("*", { count: "exact" })
    : supabase.from("epc_full").select("*");
}

function applyEpcFilters(q: EpcQuery, filters: Record<string, string>): EpcQuery {
  let out = q;
  for (const [key, raw] of Object.entries(filters)) {
    const val = (raw ?? "").trim();
    if (!val) continue;
    const db = COL_TO_DB[key];
    if (!db) continue;
    if (key === "printed") {
      const low = val.toLowerCase();
      if ("хэвлэгдсэн".startsWith(low)) out = out.not("printed_at", "is", null);
      else if ("хэвлээгүй".startsWith(low)) out = out.is("printed_at", null);
    } else if (db === "serial") {
      const n = val.replace(/\D/g, "");
      if (n) out = out.eq("serial", n);
    } else {
      out = out.ilike(db, `%${val}%`);
    }
  }
  return out;
}

/** Нэг хуудас EPC-г татна (нийт тоотой нь). filters/sort нь SQL талд. */
export async function fetchEpcPage(params: {
  page: number;
  pageSize: number;
  filters: Record<string, string>;
  sort: EpcSort | null;
}): Promise<EpcPage> {
  const filtered = applyEpcFilters(epcBase(true), params.filters);
  const sortDb = params.sort ? COL_TO_DB[params.sort.key] : null;
  const asc = params.sort?.dir === "asc";
  let q = filtered.order(sortDb ?? "id", { ascending: sortDb ? asc : true });
  if (sortDb && sortDb !== "id") q = q.order("id", { ascending: true }); // тогтвортой tiebreak
  const from = params.page * params.pageSize;
  const { data, error, count } = await q.range(from, from + params.pageSize - 1);
  if (error) throw error;
  return { rows: (data ?? []) as EpcRow[], total: count ?? 0 };
}

/** Шүүлтэд тохирох БҮХ мөрийг татна (export/print-д). cap-аар хязгаарлана. */
export async function fetchEpcAllMatching(
  filters: Record<string, string>,
  sort: EpcSort | null,
  cap = 100000
): Promise<EpcRow[]> {
  const sortDb = sort ? COL_TO_DB[sort.key] : null;
  const asc = sort?.dir === "asc";
  const PAGE = 1000;
  const out: EpcRow[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const filtered = applyEpcFilters(epcBase(false), filters);
    let q = filtered.order(sortDb ?? "id", { ascending: sortDb ? asc : true });
    if (sortDb && sortDb !== "id") q = q.order("id", { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as EpcRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
