import { lazy, Suspense, useEffect, useState } from "react";
import {
  fetchEpcPage,
  fetchEpcAllMatching,
  type EpcRow,
  type EpcSort,
} from "../lib/queries";
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

/** Хүснэгтийн багана бүрийн тодорхойлолт (толгой + утга авах). */
interface ColDef {
  key: string;
  label: string;
  get: (r: EpcRow) => string;
  mono?: boolean;
}

const COLUMNS: ColDef[] = [
  { key: "epc", label: "EPC (hex)", get: (r) => r.epc_hex, mono: true },
  { key: "serial", label: "Serial", get: (r) => String(r.serial) },
  { key: "printed", label: "Төлөв", get: (r) => (r.printed_at ? "хэвлэгдсэн" : "хэвлээгүй") },
  { key: "name", label: "Бараа", get: (r) => r.name ?? "" },
  { key: "category", label: "Ангилал", get: (r) => r.category_name ?? "" },
  { key: "attr", label: "Шинж чанар", get: (r) => r.attributes_text ?? "" },
  { key: "sku", label: "SKU", get: (r) => r.sku ?? "", mono: true },
  { key: "gtin", label: "GTIN/баркод", get: (r) => r.gtin ?? "", mono: true },
  { key: "box", label: "Хайрцаг", get: (r) => r.box_no ?? "" },
  { key: "job", label: "Ажлын №", get: (r) => r.job_number ?? "" },
  { key: "date", label: "Ирсэн огноо", get: (r) => r.arrival_date ?? "" },
  { key: "supplier", label: "Нийлүүлэгч", get: (r) => r.supplier ?? "" },
];

// Нэг хуудсанд татах/харуулах мөрийн тоо (server-side хуудаслалт).
const PAGE_SIZE = 100;

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
  const [pageRows, setPageRows] = useState<EpcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // export/print бэлдэж байх үед
  const [error, setError] = useState<string | null>(null);
  // Багана бүрийн шүүлтийн текст (col.key -> хайх утга). debounced нь DB рүү.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [debounced, setDebounced] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0); // 0-ээс эхэлсэн хуудасны дугаар
  const [sort, setSort] = useState<EpcSort | null>(null);
  // Сонгосон мөрүүд (хуудас хооронд хадгалагдана; мөрийн дата-г бүхлээр нь хадгална).
  const [selected, setSelected] = useState<Map<string, EpcRow>>(new Map());
  const [printRows, setPrintRows] = useState<EpcRow[] | null>(null);

  const hasFilters = Object.values(debounced).some((v) => v.trim());

  // Шүүлтийн оролтыг debounce хийнэ (бичих бүрд DB-рүү явахгүй).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Хуудсыг server-ээс татах (хуудас / шүүлт / эрэмбэ / сэргээх өөрчлөгдөхөд).
  // setState-г зөвхөн async callback дотор дуудна (lint: set-state-in-effect).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetchEpcPage({ page, pageSize: PAGE_SIZE, filters: debounced, sort });
        if (!active) return;
        setPageRows(res.rows);
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, debounced, sort, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageRows;

  // Шинэ хуудас руу шилжих (spinner-ийг тэр даруй харуулна).
  function goPage(p: number) {
    setLoading(true);
    setPage(p);
  }

  function setFilter(key: string, value: string) {
    setLoading(true);
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0); // шүүх үед эхний хуудас руу
  }

  function clearFilters() {
    setLoading(true);
    setFilters({});
    setPage(0);
  }

  // Толгой дарах: өсөх → буурах → эрэмбэлэхгүй.
  function toggleSort(key: string) {
    setLoading(true);
    setSort((s) =>
      s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }
    );
    setPage(0);
  }

  function toggleRow(r: EpcRow) {
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(r.id)) n.delete(r.id);
      else n.set(r.id, r);
      return n;
    });
  }
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  function toggleAllVisible() {
    setSelected((m) => {
      const n = new Map(m);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.set(r.id, r));
      return n;
    });
  }

  /** Export/print-д ашиглах мөрүүд: сонгосон байвал тэдгээр, эс бөгөөс шүүсэн БҮХ мөр. */
  async function resolveRows(): Promise<EpcRow[]> {
    if (selected.size > 0) return [...selected.values()];
    return fetchEpcAllMatching(debounced, sort);
  }

  /** Өгсөн EPC-үүдийг "хэвлэгдсэн" болгож тэмдэглэнэ (DB + локал). */
  async function markPrinted(ids: string[]) {
    if (ids.length === 0) return;
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    // Optimistic: харагдаж буй хуудас + сонголтод тусгана.
    setPageRows((rs) => rs.map((r) => (idSet.has(r.id) && !r.printed_at ? { ...r, printed_at: now } : r)));
    setSelected((m) => {
      const n = new Map(m);
      for (const id of ids) {
        const r = n.get(id);
        if (r && !r.printed_at) n.set(id, { ...r, printed_at: now });
      }
      return n;
    });
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const { error: e } = await supabase
          .from("epc_codes")
          .update({ printed_at: now })
          .in("id", ids.slice(i, i + 500))
          .is("printed_at", null);
        if (e) throw e;
      }
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      const flat = rows.map((r) => ({
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
        printed: r.printed_at ? "хэвлэгдсэн" : "хэвлээгүй",
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
        { key: "printed", label: "Төлөв" },
        { key: "created_at", label: "Үүссэн" },
      ]);
      downloadCsv(`epc-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      void logAuditEvent(supabase, "export_csv", "epc", null, { count: rows.length });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleExportZpl() {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      const zpl = buildZplBatch(
        rows.map((r) => ({
          epcHex: r.epc_hex,
          name: r.name,
          gtin: r.gtin,
          sku: r.sku,
          boxNo: r.box_no,
          serial: r.serial,
        }))
      );
      downloadZpl(`epc-labels-${new Date().toISOString().slice(0, 10)}.zpl`, zpl);
      void logAuditEvent(supabase, "export_zpl", "epc", null, { count: rows.length });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openPrint() {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      if (rows.length === 0) {
        setError("Хэвлэх мөр алга.");
        return;
      }
      setPrintRows(rows);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // Export/print товчны тоо: сонгосон байвал сонголтын тоо, эс бөгөөс нийт (шүүсэн).
  const outCount = selected.size > 0 ? selected.size : total;

  return (
    <div className="space-y-4">
      {/* Үйлдлийн мөр */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">
          {hasFilters ? "Шүүсэн" : "Нийт"} <strong>{total.toLocaleString()}</strong>
        </span>
        <div className="flex-1" />
        {hasFilters && (
          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Шүүлт цэвэрлэх
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={busy || outCount === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          CSV татах ({outCount.toLocaleString()})
        </button>
        <button
          onClick={handleExportZpl}
          disabled={busy || outCount === 0}
          className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50"
        >
          ZPL татах ({outCount.toLocaleString()})
        </button>
        <button
          onClick={openPrint}
          disabled={busy || outCount === 0}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          🖨 Хэвлэх ({outCount.toLocaleString()})
        </button>
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Map())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            Сонголт цэвэрлэх ({selected.size})
          </button>
        )}
        {(loading || busy) && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg className="h-4 w-4 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            {busy ? "Бэлдэж байна…" : "Ачаалж байна…"}
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Хүснэгт — толгой нь scroll үед дээрээ наалддаг (sticky), багана бүрд шүүлт/эрэмбэ */}
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
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="mb-1 flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-slate-500 hover:text-indigo-600"
                    title="Эрэмбэлэх"
                  >
                    {c.label}
                    <span className="text-[10px] text-slate-400">
                      {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
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
            {loading && visible.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium">EPC өгөгдөл ачаалж байна…</span>
                  </div>
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={COLUMNS.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {hasFilters ? "Шүүлтэд тохирох мөр алга." : "EPC алга."}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className={"hover:bg-slate-50" + (selected.has(r.id) ? " bg-indigo-50" : "")}>
                  <td className="border-b border-slate-100 px-2 py-2 text-center">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r)} />
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
                        {c.key === "printed" ? (
                          r.printed_at ? (
                            <span
                              className="rounded bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700"
                              title={new Date(r.printed_at).toLocaleString()}
                            >
                              Хэвлэгдсэн
                            </span>
                          ) : (
                            <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                              Хэвлээгүй
                            </span>
                          )
                        ) : (
                          v || <span className="text-slate-300">—</span>
                        )}
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
            onClick={() => goPage(0)}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            «
          </button>
          <button
            onClick={() => goPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Өмнөх
          </button>
          <span className="px-2 text-slate-600">
            Хуудас <strong>{safePage + 1}</strong> / {pageCount.toLocaleString()}
          </span>
          <button
            onClick={() => goPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            Дараах
          </button>
          <button
            onClick={() => goPage(pageCount - 1)}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            »
          </button>
        </div>
      )}

      {printRows && (
        <Suspense fallback={null}>
          <PrintDialog
            rows={printRows}
            onClose={() => setPrintRows(null)}
            onPrinted={() => markPrinted(printRows.map((r) => r.id))}
          />
        </Suspense>
      )}
    </div>
  );
}
