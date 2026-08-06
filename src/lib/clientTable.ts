// Client-side өгөгдлийг tnks DataTable-ийн fetchDataFn хэлбэрт хөрвүүлэх
// ЦЭВЭР туслахууд: ерөнхий хайлт, баганын шүүлт ("агуулсан"), огнооны
// интервал, эрэмбэ, хуудаслалт — бүгд санах ойд. Жижиг жагсаалтуудад
// (Бүтээгдэхүүн, Гүйлгээний түүх г.м.); EPC шиг том өгөгдөл server-side.

/** tnks DataTable-ийн fetchDataFn-д ирдэг параметрүүд (vendored хэлбэр). */
export interface ClientPageParams {
  page: number; // 1-ээс эхэлнэ
  limit: number;
  search: string;
  from_date: string; // "" эсвэл YYYY-MM-DD
  to_date: string;
  sort_by: string;
  sort_order: string; // "asc" | "desc"
}

export interface ClientTableOpts<T> {
  /** Ерөнхий хайлтад орох утгууд (аль нэг нь агуулбал таарна). */
  searchValues: (row: T) => Array<string | number | null | undefined>;
  /** Эрэмбийн багана: id → утга (тоо бол тоогоор — зөв эрэмбэлэгдэнэ). */
  sorters: Record<string, (row: T) => string | number | null | undefined>;
  /** Баганын шүүлт: key → утга ("агуулсан", том/жижиг ялгахгүй). */
  filterValues?: Record<string, (row: T) => string | number | null | undefined>;
  /** Огнооны интервалын эх утга (ISO timestamp) — ЛОКАЛ огноогоор тулгана. */
  dateValue?: (row: T) => string | null | undefined;
}

/** ISO timestamp → локал YYYY-MM-DD (date filter хэрэглэгчийн бүсээр тулгана). */
export function localDateStr(iso: string): string {
  const d = new Date(iso);
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function contains(v: string | number | null | undefined, q: string): boolean {
  return v != null && String(v).toLowerCase().includes(q);
}

/** Хайлт+шүүлт+интервал+эрэмбэ+хуудас — нэг дор. Эх массивыг өөрчлөхгүй. */
export function clientPage<T>(
  rows: T[],
  p: ClientPageParams,
  opts: ClientTableOpts<T>,
  filters?: Record<string, string>
): { rows: T[]; total: number; totalPages: number; page: number } {
  let list = rows;

  const q = p.search.trim().toLowerCase();
  if (q) list = list.filter((r) => opts.searchValues(r).some((v) => contains(v, q)));

  if (filters && opts.filterValues) {
    for (const [key, raw] of Object.entries(filters)) {
      const fq = raw.trim().toLowerCase();
      const get = opts.filterValues[key];
      if (!fq || !get) continue;
      list = list.filter((r) => contains(get(r), fq));
    }
  }

  if (opts.dateValue && (p.from_date || p.to_date)) {
    list = list.filter((r) => {
      const iso = opts.dateValue!(r);
      if (!iso) return false;
      const d = localDateStr(iso);
      if (p.from_date && d < p.from_date) return false;
      if (p.to_date && d > p.to_date) return false;
      return true;
    });
  }

  const sorter = opts.sorters[p.sort_by];
  if (sorter) {
    const dir = p.sort_order === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => {
      const va = sorter(a);
      const vb = sorter(b);
      // null/хоосон утга үргэлж СҮҮЛД (чиглэлээс үл хамааран).
      const ea = va == null || va === "";
      const eb = vb == null || vb === "";
      if (ea && eb) return 0;
      if (ea) return 1;
      if (eb) return -1;
      if (typeof va === "number" && typeof vb === "number") return (va - vb) * dir;
      return String(va).localeCompare(String(vb), undefined, { numeric: true }) * dir;
    });
  }

  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / p.limit));
  const page = Math.min(Math.max(1, p.page), totalPages);
  return { rows: list.slice((page - 1) * p.limit, page * p.limit), total, totalPages, page };
}

/** clientPage-ийн дүнг tnks fetchDataFn-ий хүлээдэг бүтцээр буцаана. */
export function clientFetchResult<T>(
  rows: T[],
  p: ClientPageParams,
  opts: ClientTableOpts<T>,
  filters?: Record<string, string>
): {
  success: boolean;
  data: T[];
  pagination: { page: number; limit: number; total_pages: number; total_items: number };
} {
  const r = clientPage(rows, p, opts, filters);
  return {
    success: true,
    data: r.rows,
    pagination: { page: r.page, limit: p.limit, total_pages: r.totalPages, total_items: r.total },
  };
}
