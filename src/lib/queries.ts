// ============================================================
// Supabase унших query-ууд: EPC хүснэгт (бүх мөр) ба EPC hex-ээр буцаах
// хайлт. RLS-ийн ачаар бүгд тенантаар хязгаарлагдана.
// ============================================================
import { supabase } from "./supabaseClient";

/** EPC хүснэгтийн нэг мөр (jobs, products-той нийлүүлсэн). */
export interface EpcRow {
  id: string;
  serial: number;
  epc_hex: string;
  box_no: string | null;
  created_at: string;
  job_id: string;
  product_id: string;
  jobs: {
    job_number: string;
    arrival_date: string;
    supplier: string | null;
  } | null;
  products: {
    name: string | null;
    gtin: string;
    sku: string | null;
  } | null;
}

const EPC_SELECT =
  "id, serial, epc_hex, box_no, created_at, job_id, product_id, " +
  "jobs!inner(job_number, arrival_date, supplier), " +
  "products(name, gtin, sku)";

/**
 * Бүх EPC-г хуудаслан татна (1000-ийн хязгааргүй). Хуудаслалт тогтвортой
 * байхын тулд (created_at desc, id) дарааллаар эрэмбэлнэ. Олон мянган мөрийг
 * хүснэгтэд харуулах / экспортлоход ашиглана.
 */
export async function fetchAllEpcs(): Promise<EpcRow[]> {
  const PAGE = 1000;
  const all: EpcRow[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await supabase
      .from("epc_codes")
      .select(EPC_SELECT)
      .order("created_at", { ascending: false })
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as unknown as EpcRow[];
    all.push(...rows);
    if (rows.length < PAGE) break;
  }
  return all;
}

/** Нэг EPC hex-ээр буцаах хайлт. Олдоогүй бол null. */
export async function lookupEpc(epcHex: string): Promise<EpcRow | null> {
  const { data, error } = await supabase
    .from("epc_codes")
    .select(EPC_SELECT)
    .eq("epc_hex", epcHex)
    .maybeSingle();
  if (error) throw error;
  return (data as unknown as EpcRow) ?? null;
}
