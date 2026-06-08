import { useCallback, useEffect, useState } from "react";
import {
  fetchEpcs,
  fetchJobs,
  fetchProducts,
  type EpcFilters,
  type EpcRow,
  type JobOption,
  type ProductOption,
} from "../lib/queries";
import { downloadCsv, toCsv } from "../lib/exportCsv";

/** Сэргээх дохио: энэ тоо өөрчлөгдөхөд дахин татна. */
interface Props {
  refreshKey?: number;
}

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

function productLabel(p: ProductOption): string {
  return p.name || p.source_gtin || `ref ${p.item_reference}`;
}

export default function EpcTable({ refreshKey = 0 }: Props) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [products, setProducts] = useState<ProductOption[]>([]);
  const [rows, setRows] = useState<EpcRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Шүүлтийн төлөв
  const [jobId, setJobId] = useState("");
  const [productId, setProductId] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const filters: EpcFilters = {
        jobId: jobId || undefined,
        productId: productId || undefined,
        dateFrom: dateFrom || undefined,
        dateTo: dateTo || undefined,
      };
      const data = await fetchEpcs(filters);
      setRows(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [jobId, productId, dateFrom, dateTo]);

  // Dropdown-уудыг (ажил/бараа) ачаалах + сэргээх дохиогоор дахин
  useEffect(() => {
    fetchJobs().then(setJobs).catch(() => {});
    fetchProducts().then(setProducts).catch(() => {});
  }, [refreshKey]);

  // Шүүлт өөрчлөгдөх бүрт / сэргээх дохиогоор EPC дахин татах
  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  function clearFilters() {
    setJobId("");
    setProductId("");
    setDateFrom("");
    setDateTo("");
  }

  function handleExport() {
    const flat = rows.map((r) => ({
      epc_hex: r.epc_hex,
      serial: r.serial,
      product: r.products?.name ?? "",
      item_reference: r.products?.item_reference ?? "",
      source_gtin: r.products?.source_gtin ?? "",
      job_number: r.jobs?.job_number ?? "",
      arrival_date: r.jobs?.arrival_date ?? "",
      supplier: r.jobs?.supplier ?? "",
      created_at: r.created_at,
    }));
    const csv = toCsv(flat, [
      { key: "epc_hex", label: "EPC (hex)" },
      { key: "serial", label: "Serial" },
      { key: "product", label: "Бараа" },
      { key: "item_reference", label: "Item ref" },
      { key: "source_gtin", label: "Source GTIN" },
      { key: "job_number", label: "Ажлын №" },
      { key: "arrival_date", label: "Ирсэн огноо" },
      { key: "supplier", label: "Нийлүүлэгч" },
      { key: "created_at", label: "Үүссэн" },
    ]);
    downloadCsv(`epc-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
  }

  return (
    <div className="space-y-4">
      {/* Шүүлтүүд */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Ажил</label>
            <select value={jobId} onChange={(e) => setJobId(e.target.value)} className={inputCls}>
              <option value="">Бүгд</option>
              {jobs.map((j) => (
                <option key={j.id} value={j.id}>
                  {j.job_number} · {j.arrival_date}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Бараа</label>
            <select
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              className={inputCls}
            >
              <option value="">Бүгд</option>
              {products.map((p) => (
                <option key={p.id} value={p.id}>
                  {productLabel(p)}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Огноо (-аас)</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={inputCls}
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Огноо (хүртэл)</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={inputCls}
            />
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Шүүлт цэвэрлэх
          </button>
          <button
            onClick={handleExport}
            disabled={rows.length === 0}
            className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            CSV татах ({rows.length})
          </button>
          {loading && <span className="text-sm text-slate-500">Ачаалж байна…</span>}
        </div>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
      )}

      {/* Хүснэгт */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">EPC (hex)</th>
              <th className="px-4 py-3">Serial</th>
              <th className="px-4 py-3">Бараа</th>
              <th className="px-4 py-3">Ажлын №</th>
              <th className="px-4 py-3">Ирсэн огноо</th>
              <th className="px-4 py-3">Нийлүүлэгч</th>
              <th className="px-4 py-3">Үүссэн</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-slate-400">
                  EPC олдсонгүй.
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-slate-800">
                    {r.epc_hex}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{r.serial}</td>
                  <td className="px-4 py-2 text-slate-700">
                    {r.products?.name || (
                      <span className="text-slate-400">ref {r.products?.item_reference}</span>
                    )}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{r.jobs?.job_number}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-700">
                    {r.jobs?.arrival_date}
                  </td>
                  <td className="px-4 py-2 text-slate-700">{r.jobs?.supplier ?? "—"}</td>
                  <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                    {new Date(r.created_at).toLocaleString()}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
