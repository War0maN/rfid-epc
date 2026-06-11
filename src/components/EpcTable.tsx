import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { fetchAllEpcs, type EpcRow } from "../lib/queries";
import { downloadCsv, toCsv } from "../lib/exportCsv";
import { buildZplBatch, downloadZpl } from "../lib/exportZpl";
import { epcHexToUri, epcHexToTagUri } from "../lib/epc";
import { supabase } from "../lib/supabaseClient";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";
// bwip-js (баркод) том тул хэвлэх диалогийг зөвхөн нээх үед ачаална.
const PrintDialog = lazy(() => import("./PrintDialog"));

/** Сэргээх дохио: энэ тоо өөрчлөгдөхөд дахин татна. */
interface Props {
  refreshKey?: number;
}

/** Хүснэгтийн багана бүрийн тодорхойлолт (толгой + утга авах + шүүх). */
interface ColDef {
  key: string;
  label: string;
  get: (r: EpcRow) => string;
  mono?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: "epc", label: "EPC (hex)", get: (r) => r.epc_hex, mono: true },
  { key: "serial", label: "Serial", get: (r) => String(r.serial) },
  { key: "name", label: "Бараа", get: (r) => r.name ?? "" },
  { key: "sku", label: "SKU", get: (r) => r.sku ?? "", mono: true },
  { key: "gtin", label: "GTIN/баркод", get: (r) => r.gtin ?? "", mono: true },
  { key: "box", label: "Хайрцаг", get: (r) => r.box_no ?? "" },
  { key: "job", label: "Ажлын №", get: (r) => r.job_number ?? "" },
  { key: "date", label: "Ирсэн огноо", get: (r) => r.arrival_date ?? "" },
  { key: "supplier", label: "Нийлүүлэгч", get: (r) => r.supplier ?? "" },
];

// Нэг хуудсанд харуулах мөрийн тоо (DOM-ийг хөнгөн байлгана; экспорт нь бүгдийг).
const PAGE_SIZE = 1000;

/** hex -> URI; декод бүтэлгүйтвэл хоосон (export эвдрэхгүй). SGTIN/GID хоёуланг. */
function safeUri(hex: string): string {
  try {
    return epcHexToUri(hex);
  } catch {
    return "";
  }
}
function safeTagUri(hex: string): string {
  try {
    return epcHexToTagUri(hex);
  } catch {
    return "";
  }
}

export default function EpcTable({ refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<EpcRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Багана бүрийн шүүлтийн текст (col.key -> хайх утга).
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0); // 0-ээс эхэлсэн хуудасны дугаар
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showPrint, setShowPrint] = useState(false);

  // Бүх EPC-г татах (refreshKey өөрчлөгдөх бүрт дахин). setState-г зөвхөн
  // promise callback дотор дуудаж lint-ийн set-state-in-effect-ээс зайлсхийнэ.
  useEffect(() => {
    let active = true;
    fetchAllEpcs()
      .then((data) => {
        if (active) {
          setRows(data);
          setError(null);
        }
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Идэвхтэй (хоосон биш) шүүлтүүд
  const activeFilters = useMemo(
    () =>
      COLUMNS.map((c) => ({ col: c, q: (filters[c.key] ?? "").trim().toLowerCase() })).filter(
        (f) => f.q.length > 0
      ),
    [filters]
  );

  // Шүүсэн мөрүүд (бүх багана дээрх шүүлт хослон ажиллана)
  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return rows;
    return rows.filter((r) =>
      activeFilters.every((f) => f.col.get(r).toLowerCase().includes(f.q))
    );
  }, [rows, activeFilters]);

  // Хуудаслалт. Шүүлт/дата өөрчлөгдөхөд хуудсыг хүрээнд барина.
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0); // шүүх үед эхний хуудас руу
  }

  function clearFilters() {
    setFilters({});
    setPage(0);
  }

  // Хэвлэх мөрүүд: сонгосон байвал тэдгээр, эс бөгөөс шүүсэн бүгд.
  const printRows = selectedIds.size > 0 ? filtered.filter((r) => selectedIds.has(r.id)) : filtered;

  function toggleRow(id: string) {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selectedIds.has(r.id));
  function toggleAllVisible() {
    setSelectedIds((s) => {
      const n = new Set(s);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.add(r.id));
      return n;
    });
  }

  function handleExport() {
    const flat = filtered.map((r) => ({
      epc_hex: r.epc_hex,
      epc_uri: safeUri(r.epc_hex),
      epc_tag_uri: safeTagUri(r.epc_hex),
      serial: r.serial,
      product: r.name ?? "",
      sku: r.sku ?? "",
      gtin: r.gtin ?? "",
      box_no: r.box_no ?? "",
      job_number: r.job_number ?? "",
      arrival_date: r.arrival_date ?? "",
      supplier: r.supplier ?? "",
      created_at: r.created_at,
    }));
    const csv = toCsv(flat, [
      { key: "epc_hex", label: "EPC (hex)" },
      { key: "epc_uri", label: "EPC URI" },
      { key: "epc_tag_uri", label: "EPC Tag URI" },
      { key: "serial", label: "Serial" },
      { key: "product", label: "Бараа" },
      { key: "sku", label: "SKU" },
      { key: "gtin", label: "GTIN/баркод" },
      { key: "box_no", label: "Хайрцаг" },
      { key: "job_number", label: "Ажлын №" },
      { key: "arrival_date", label: "Ирсэн огноо" },
      { key: "supplier", label: "Нийлүүлэгч" },
      { key: "created_at", label: "Үүссэн" },
    ]);
    downloadCsv(`epc-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "epc", null, { count: filtered.length });
  }

  function handleExportZpl() {
    const zpl = buildZplBatch(
      filtered.map((r) => ({
        epcHex: r.epc_hex,
        name: r.name,
        gtin: r.gtin,
        sku: r.sku,
        boxNo: r.box_no,
        serial: r.serial,
      }))
    );
    downloadZpl(`epc-labels-${new Date().toISOString().slice(0, 10)}.zpl`, zpl);
    void logAuditEvent(supabase, "export_zpl", "epc", null, { count: filtered.length });
  }

  return (
    <div className="space-y-4">
      {/* Үйлдлийн мөр */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">
          Нийт <strong>{rows.length}</strong>
          {activeFilters.length > 0 && (
            <>
              {" · "}шүүсэн <strong>{filtered.length}</strong>
            </>
          )}
        </span>
        <div className="flex-1" />
        {activeFilters.length > 0 && (
          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Шүүлт цэвэрлэх
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={filtered.length === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          CSV татах ({filtered.length})
        </button>
        <button
          onClick={handleExportZpl}
          disabled={filtered.length === 0}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          ZPL татах ({filtered.length})
        </button>
        <button
          onClick={() => setShowPrint(true)}
          disabled={printRows.length === 0}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          🖨 Хэвлэх ({printRows.length})
        </button>
        {selectedIds.size > 0 && (
          <button
            onClick={() => setSelectedIds(new Set())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Сонголт цэвэрлэх ({selectedIds.size})
          </button>
        )}
        {loading && <span className="text-sm text-slate-500">Ачаалж байна…</span>}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Хүснэгт — толгой нь scroll үед дээрээ наалддаг (sticky), багана бүрд шүүлт */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 align-top">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  title="Энэ хуудсыг бүгдийг сонгох"
                />
              </th>
              {COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left align-top"
                >
                  <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {c.label}
                  </div>
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilter(c.key, e.target.value)}
                    placeholder="Шүүх…"
                    className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && !loading ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {rows.length === 0 ? "EPC алга." : "Шүүлтэд тохирох мөр алга."}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className={"hover:bg-slate-50" + (selectedIds.has(r.id) ? " bg-indigo-50" : "")}>
                  <td className="border-b border-slate-100 px-2 py-2 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.has(r.id)}
                      onChange={() => toggleRow(r.id)}
                    />
                  </td>
                  {COLUMNS.map((c) => {
                    const v = c.get(r);
                    return (
                      <td
                        key={c.key}
                        className={
                          "whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700" +
                          (c.mono ? " font-mono text-xs" : "")
                        }
                      >
                        {v || <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Хуудаслалт */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => setPage(0)}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            «
          </button>
          <button
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Өмнөх
          </button>
          <span className="px-2 text-slate-600">
            Хуудас <strong>{safePage + 1}</strong> / {pageCount}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Дараах
          </button>
          <button
            onClick={() => setPage(pageCount - 1)}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            »
          </button>
        </div>
      )}

      {showPrint && (
        <Suspense fallback={null}>
          <PrintDialog rows={printRows} onClose={() => setShowPrint(false)} />
        </Suspense>
      )}
    </div>
  );
}
