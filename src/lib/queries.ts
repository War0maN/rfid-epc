// ============================================================
// Supabase унших query-ууд: EPC хүснэгт (бүх мөр) ба EPC hex-ээр буцаах
// хайлт. RLS-ийн ачаар бүгд тенантаар хязгаарлагдана.
//
// Гүйцэтгэл: epc_codes-г JOIN-гүйгээр хавтгай татаж, жижиг products/jobs
// хүснэгтийг нэг удаа аваад JS дотор холбоно. Хуудаслалт нь offset биш
// keyset (id > сүүлийн) тул олон мянган мөрд ч хурдан.
// ============================================================
import { supabase } from "./supabaseClient";
import type { EpcStatus } from "./epcStatus";

/** EPC хүснэгтийн нэг мөр (products/jobs-ийн талбарууд хавтгайгаар нэгдсэн). */
export interface EpcRow {
  id: string;
  serial: number;
  epc_hex: string;
  box_no: string | null;
  created_at: string;
  printed_at: string | null; // хэвлэсэн огноо (null бол хэвлээгүй)
  status: EpcStatus; // lifecycle төлөв (Хэвлээгүй/Идэвхтэй/Борлуулсан/...)
  job_id: string;
  product_id: string;
  branch_id: string | null;
  branch_name: string | null;
  name: string | null;
  gtin: string;
  sku: string | null;
  price: number | null;
  category_id: string | null;
  category_l1: string | null; // Үндсэн ангилал
  category_l2: string | null; // Дэд ангилал
  category_l3: string | null; // Барааны ангилал
  category_name: string | null; // leaf (хуучин тааруулга)
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
  price: number | null;
  category_id: string | null;
  attributes: Record<string, string> | null;
}
interface CatLite {
  name: string;
  parent_id: string | null;
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
      supabase.from("products").select("id, name, gtin, sku, price, category_id, attributes"),
      supabase.from("jobs").select("id, job_number, arrival_date, supplier"),
      supabase.from("categories").select("id, name, parent_id"),
    ]);
  if (pErr) throw pErr;
  if (jErr) throw jErr;
  if (cErr) throw cErr;
  const { data: brs } = await supabase.from("branches").select("id, name");
  const pMap = new Map((prods as ProductLite[]).map((p) => [p.id, p]));
  const jMap = new Map((jobs as JobLite[]).map((j) => [j.id, j]));
  const cMap = new Map(
    (cats as { id: string; name: string; parent_id: string | null }[]).map((c) => [
      c.id,
      { name: c.name, parent_id: c.parent_id },
    ])
  );
  const bMap = new Map(((brs ?? []) as { id: string; name: string }[]).map((b) => [b.id, b.name]));
  return { pMap, jMap, cMap, bMap };
}

/** Leaf category id-ээс дээш 3 түвшнийг (дээдээс доош) гаргана. */
function categoryLevels(
  leafId: string | null,
  cMap: Map<string, CatLite>
): { l1: string | null; l2: string | null; l3: string | null } {
  const chain: string[] = [];
  let cur = leafId;
  while (cur && chain.length < 5) {
    const c = cMap.get(cur);
    if (!c) break;
    chain.unshift(c.name); // дээд талд эцэг
    cur = c.parent_id;
  }
  return { l1: chain[0] ?? null, l2: chain[1] ?? null, l3: chain[2] ?? null };
}

interface FlatEpc {
  id: string;
  serial: number;
  epc_hex: string;
  box_no: string | null;
  created_at: string;
  printed_at: string | null;
  status: EpcStatus;
  job_id: string;
  product_id: string;
  branch_id: string | null;
}

function joinRow(
  r: FlatEpc,
  pMap: Map<string, ProductLite>,
  jMap: Map<string, JobLite>,
  cMap: Map<string, CatLite>,
  bMap: Map<string, string>
): EpcRow {
  const p = pMap.get(r.product_id);
  const j = jMap.get(r.job_id);
  const attributes = p?.attributes ?? {};
  const lv = categoryLevels(p?.category_id ?? null, cMap);
  return {
    ...r,
    branch_name: r.branch_id ? (bMap.get(r.branch_id) ?? null) : null,
    name: p?.name ?? null,
    gtin: p?.gtin ?? "",
    sku: p?.sku ?? null,
    price: p?.price ?? null,
    category_id: p?.category_id ?? null,
    category_l1: lv.l1,
    category_l2: lv.l2,
    category_l3: lv.l3,
    category_name: p?.category_id ? (cMap.get(p.category_id)?.name ?? null) : null,
    attributes,
    attributes_text: attrsToText(attributes),
    job_number: j?.job_number ?? null,
    arrival_date: j?.arrival_date ?? null,
    supplier: j?.supplier ?? null,
  };
}

const FLAT_SELECT = "id, serial, epc_hex, box_no, created_at, printed_at, status, job_id, product_id, branch_id";

/**
 * Бүх EPC-г татна (1000-ийн хязгааргүй). epc_codes-г JOIN-гүй хавтгай,
 * keyset (id-ээр) хуудаслалтаар татаад products/jobs-той JS дотор холбоно.
 */
export async function fetchAllEpcs(): Promise<EpcRow[]> {
  const { pMap, jMap, cMap, bMap } = await fetchLookupMaps();

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
    for (const r of rows) all.push(joinRow(r, pMap, jMap, cMap, bMap));
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
  const { pMap, jMap, cMap, bMap } = await fetchLookupMaps();
  return joinRow(data as FlatEpc, pMap, jMap, cMap, bMap);
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
  status: "status",
  name: "name",
  sku: "sku",
  price: "price",
  gtin: "gtin",
  cat1: "category_l1",
  cat2: "category_l2",
  cat3: "category_l3",
  attr: "attributes_text",
  branch: "branch_name",
  box: "box_no",
  job: "job_number",
  date: "arrival_date",
  supplier: "supplier",
};

/**
 * Баганын түлхүүр → DB баганын нэр (эсвэл jsonb зам). "attr:<нэр>" нь шинж
 * чанарын динамик багана → attributes->>'нэр' jsonb замаар шүүж/эрэмбэлнэ.
 */
function colToDb(key: string): string | null {
  if (key.startsWith("attr:")) {
    const label = key.slice(5);
    const safe = /^[^\s"]+$/.test(label) ? label : `"${label.replace(/"/g, "")}"`;
    return `attributes->>${safe}`;
  }
  return COL_TO_DB[key] ?? null;
}

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
    const db = colToDb(key);
    if (!db) continue;
    if (key === "status") {
      // Dropdown-аас төлөвийн код (unprinted/active/...) ирнэ — яг тэнцүүгээр.
      out = out.eq("status", val);
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
  const sortDb = params.sort ? colToDb(params.sort.key) : null;
  const asc = params.sort?.dir === "asc";
  // Анхдагч: сүүлд үүссэн нь эхэндээ, нэг ажлын дотор serial өсөхөөр
  // (id нь uuid тул утгагүй — зөвхөн тогтвортой tiebreak).
  let q = sortDb
    ? filtered.order(sortDb, { ascending: asc })
    : filtered.order("created_at", { ascending: false }).order("serial", { ascending: true });
  if (sortDb !== "id") q = q.order("id", { ascending: true }); // тогтвортой tiebreak
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
  const sortDb = sort ? colToDb(sort.key) : null;
  const asc = sort?.dir === "asc";
  const PAGE = 1000;
  const out: EpcRow[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const filtered = applyEpcFilters(epcBase(false), filters);
    // fetchEpcPage-тэй ижил анхдагч эрэмбэ (export дэлгэцтэй ижил дараалалтай).
    let q = sortDb
      ? filtered.order(sortDb, { ascending: asc })
      : filtered.order("created_at", { ascending: false }).order("serial", { ascending: true });
    if (sortDb !== "id") q = q.order("id", { ascending: true });
    const { data, error } = await q.range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as EpcRow[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}
