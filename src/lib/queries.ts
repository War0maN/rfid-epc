// ============================================================
// Supabase унших query-ууд: ажил/барааны жагсаалт, EPC хүснэгт (шүүлттэй),
// EPC hex-ээр буцаах хайлт. RLS-ийн ачаар бүгд тенантаар хязгаарлагдана.
// ============================================================
import { supabase } from "./supabaseClient";

export interface JobOption {
  id: string;
  job_number: string;
  arrival_date: string;
  supplier: string | null;
}

export interface ProductOption {
  id: string;
  name: string | null;
  gtin: string;
  sku: string | null;
}

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

export interface EpcFilters {
  jobId?: string;
  productId?: string;
  dateFrom?: string; // jobs.arrival_date >= (YYYY-MM-DD)
  dateTo?: string; // jobs.arrival_date <= (YYYY-MM-DD)
}

const EPC_SELECT =
  "id, serial, epc_hex, box_no, created_at, job_id, product_id, " +
  "jobs!inner(job_number, arrival_date, supplier), " +
  "products(name, gtin, sku)";

/** Шүүлтийн dropdown-д зориулж ажлуудыг татна (шинэ нь эхэнд). */
export async function fetchJobs(): Promise<JobOption[]> {
  const { data, error } = await supabase
    .from("jobs")
    .select("id, job_number, arrival_date, supplier")
    .order("arrival_date", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as JobOption[];
}

/** Шүүлтийн dropdown-д зориулж бараануудыг татна. */
export async function fetchProducts(): Promise<ProductOption[]> {
  const { data, error } = await supabase
    .from("products")
    .select("id, name, gtin, sku")
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as ProductOption[];
}

/** EPC-үүдийг шүүлтийн дагуу татна. */
export async function fetchEpcs(filters: EpcFilters = {}): Promise<EpcRow[]> {
  let q = supabase.from("epc_codes").select(EPC_SELECT);

  if (filters.jobId) q = q.eq("job_id", filters.jobId);
  if (filters.productId) q = q.eq("product_id", filters.productId);
  if (filters.dateFrom) q = q.gte("jobs.arrival_date", filters.dateFrom);
  if (filters.dateTo) q = q.lte("jobs.arrival_date", filters.dateTo);

  q = q.order("created_at", { ascending: false }).limit(1000);

  const { data, error } = await q;
  if (error) throw error;
  // Supabase embedded to-one-г объектоор буцаадаг; төрлийг нэгтгэе.
  return (data ?? []) as unknown as EpcRow[];
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
