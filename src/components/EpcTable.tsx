import { useEffect, useMemo, useState } from "react";
import { fetchAllEpcs, type EpcRow } from "../lib/queries";
import { downloadCsv, toCsv } from "../lib/exportCsv";
import { buildZplBatch, downloadZpl } from "../lib/exportZpl";
import { sgtin96HexToUri, sgtin96HexToTagUri } from "../lib/epc";
import { supabase } from "../lib/supabaseClient";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

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
  { key: "name", label: "Бараа", get: (r) => r.products?.name ?? "" },
  { key: "sku", label: "SKU", get: (r) => r.products?.sku ?? "", mono: true },
  { key: "gtin", label: "GTIN/баркод", get: (r) => r.products?.gtin ?? "", mono: true },
  { key: "box", label: "Хайрцаг", get: (r) => r.box_no ?? "" },
  { key: "job", label: "Ажлын №", get: (r) => r.jobs?.job_number ?? "" },
  { key: "date", label: "Ирсэн огноо", get: (r) => r.jobs?.arrival_date ?? "" },
  { key: "supplier", label: "Нийлүүлэгч", get: (r) => r.jobs?.supplier ?? "" },
];

// DOM-ийг хэт ачаалахгүйн тулд харуулах мөрийн дээд хязгаар (экспортод хязгааргүй).
const MAX_DISPLAY = 1000;

/** hex -> URI; декод бүтэлгүйтвэл хоосон (export эвдрэхгүй). */
function safeUri(hex: string): string {
  try {
    return sgtin96HexToUri(hex);
  } catch {
    return "";
  }
}
function safeTagUri(hex: string): string {
  try {
    return sgtin96HexToTagUri(hex);
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

  const visible = filtered.slice(0, MAX_DISPLAY);

  function clearFilters() {
    setFilters({});
  }

  function handleExport() {
    const flat = filtered.map((r) => ({
      epc_hex: r.epc_hex,
      epc_uri: safeUri(r.epc_hex),
      epc_tag_uri: safeTagUri(r.epc_hex),
      serial: r.serial,
      product: r.products?.name ?? "",
      sku: r.products?.sku ?? "",
      gtin: r.products?.gtin ?? "",
      box_no: r.box_no ?? "",
      job_number: r.jobs?.job_number ?? "",
      arrival_date: r.jobs?.arrival_date ?? "",
      supplier: r.jobs?.supplier ?? "",
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
        name: r.products?.name,
        gtin: r.products?.gtin,
        sku: r.products?.sku,
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
        {loading && <span className="text-sm text-slate-500">Ачаалж байна…</span>}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Хүснэгт — багана бүрийн доор шүүлтийн нүд */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50">
            <tr className="text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 py-2">
                  {c.label}
                </th>
              ))}
            </tr>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className="px-3 pb-2">
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilters((f) => ({ ...f, [c.key]: e.target.value }))}
                    placeholder="Шүүх…"
                    className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  />
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {visible.length === 0 && !loading ? (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-8 text-center text-slate-400">
                  {rows.length === 0 ? "EPC алга." : "Шүүлтэд тохирох мөр алга."}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className="hover:bg-slate-50">
                  {COLUMNS.map((c) => {
                    const v = c.get(r);
                    return (
                      <td
                        key={c.key}
                        className={
                          "whitespace-nowrap px-3 py-2 text-slate-700" +
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

      {filtered.length > MAX_DISPLAY && (
        <p className="text-center text-xs text-slate-500">
          {filtered.length.toLocaleString()} мөрөөс эхний {MAX_DISPLAY.toLocaleString()}-г харуулж
          байна. Бүгдийг харахын тулд шүүх эсвэл CSV татна уу.
        </p>
      )}
    </div>
  );
}
