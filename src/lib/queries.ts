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
  job_id: string;
  product_id: string;
  name: string | null;
  gtin: string;
  sku: string | null;
  job_number: string | null;
  arrival_date: string | null;
  supplier: string | null;
}

interface ProductLite {
  id: string;
  name: string | null;
  gtin: string;
  sku: string | null;
}
interface JobLite {
  id: string;
  job_number: string;
  arrival_date: string;
  supplier: string | null;
}

/** products + jobs-ийг нэг удаа татаж lookup map болгоно (жижиг хүснэгтүүд). */
async function fetchLookupMaps() {
  const [{ data: prods, error: pErr }, { data: jobs, error: jErr }] = await Promise.all([
    supabase.from("products").select("id, name, gtin, sku"),
    supabase.from("jobs").select("id, job_number, arrival_date, supplier"),
  ]);
  if (pErr) throw pErr;
  if (jErr) throw jErr;
  const pMap = new Map((prods as ProductLite[]).map((p) => [p.id, p]));
  const jMap = new Map((jobs as JobLite[]).map((j) => [j.id, j]));
  return { pMap, jMap };
}

function joinRow(
  r: {
    id: string;
    serial: number;
    epc_hex: string;
    box_no: string | null;
    created_at: string;
    job_id: string;
    product_id: string;
  },
  pMap: Map<string, ProductLite>,
  jMap: Map<string, JobLite>
): EpcRow {
  const p = pMap.get(r.product_id);
  const j = jMap.get(r.job_id);
  return {
    ...r,
    name: p?.name ?? null,
    gtin: p?.gtin ?? "",
    sku: p?.sku ?? null,
    job_number: j?.job_number ?? null,
    arrival_date: j?.arrival_date ?? null,
    supplier: j?.supplier ?? null,
  };
}

const FLAT_SELECT = "id, serial, epc_hex, box_no, created_at, job_id, product_id";

/**
 * Бүх EPC-г татна (1000-ийн хязгааргүй). epc_codes-г JOIN-гүй хавтгай,
 * keyset (id-ээр) хуудаслалтаар татаад products/jobs-той JS дотор холбоно.
 */
export async function fetchAllEpcs(): Promise<EpcRow[]> {
  const { pMap, jMap } = await fetchLookupMaps();

  const PAGE = 2000;
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
    const rows = (data ?? []) as {
      id: string;
      serial: number;
      epc_hex: string;
      box_no: string | null;
      created_at: string;
      job_id: string;
      product_id: string;
    }[];
    for (const r of rows) all.push(joinRow(r, pMap, jMap));
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
  const { pMap, jMap } = await fetchLookupMaps();
  return joinRow(
    data as {
      id: string;
      serial: number;
      epc_hex: string;
      box_no: string | null;
      created_at: string;
      job_id: string;
      product_id: string;
    },
    pMap,
    jMap
  );
}
