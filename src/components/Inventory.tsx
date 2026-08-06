// Үлдэгдэл (Phase 4) — Идэвхтэй EPC-ийн тоо, бараа × салбар матрицаар.
// tnks-data-table суурьтай: толгойн мөрний шүүлт (мэдээллийн баганад),
// ерөнхий хайлт, эрэмбэ, баганын харагдац/өргөн, CSV·Excel экспорт.
// Салбарын нүд дарахад тухайн бараа × салбарын идэвхтэй EPC-ийн модал.
// ⚠️ "Нийт"/"Нийт үнэ" нь зөвхөн ХАРАГДАЖ буй салбаруудаар тооцогдоно
// (баганаа нуувал нийлбэрээс хасагдана) — хуучин зан төлөв хэвээр.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { ListFilter, RefreshCw, X } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { supabase } from "../lib/supabaseClient";
import { listProducts, type ProductRow } from "../lib/products";
import { listBranches, type Branch } from "../lib/branches";
import { listAttributeDefs, dedupAttrs, type AttributeDef } from "../lib/catalog";
import {
  fetchStockByBranch,
  pivotStock,
  fetchActiveEpcs,
  NO_BRANCH_KEY,
  type ActiveEpc,
} from "../lib/inventory";
import {
  clientFilter,
  clientFetchResult,
  type ClientPageParams,
  type ClientTableOpts,
} from "../lib/clientTable";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { formatMoney } from "../lib/format";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

interface Props {
  refreshKey?: number;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). Салбарын багануудыг шүүнэ. */
  allowedBranches?: string[] | null;
}

/** tnks-ийн ExportableData (index signature) шаардлагад нийцүүлсэн мөр. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = ProductRow & Record<string, any>;

// Матрицын багана: info (барааны мэдээлэл), branch (салбар), total (Нийт/Нийт үнэ).
interface Col {
  key: string;
  label: string;
  kind: "info" | "branch" | "total";
  get: (p: ProductRow) => string; // түүхий текст (хайлт/шүүлт/экспортод)
  num?: boolean;
  mono?: boolean;
  branchKey?: string; // branch төрлийн баганад
}

export default function Inventory({ refreshKey = 0, allowedBranches = null }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([]);
  const [pivot, setPivot] = useState<Map<string, Map<string, number>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Толгойн мөрний шүүлт (зөвхөн мэдээллийн баганад) + "бүгдийг харуулах".
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showAll, setShowAll] = useState(false); // false = зөвхөн үлдэгдэлтэй
  /** Баганын харагдац (DataTable-аас) — нуусан салбар нийлбэрт ороогүй. */
  const [columnVisibility, setColumnVisibility] = useState<Record<string, boolean>>({});
  /** Шүүлтэд тохирсон мөрүүдийн нэгтгэл (дээд мөрөнд харуулна). */
  const [summary, setSummary] = useState({ count: 0, qty: 0, value: 0 });
  const [reloadKey, setReloadKey] = useState(0);

  // EPC жагсаалтын модал (тухайн бараа × салбар).
  const [modal, setModal] = useState<{ product: ProductRow; branchKey: string; label: string } | null>(null);
  const [modalEpcs, setModalEpcs] = useState<ActiveEpc[] | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listProducts(), listBranches(), listAttributeDefs(), fetchStockByBranch()])
      .then(([p, b, d, cells]) => {
        if (!active) return;
        setRows(p);
        setBranches(b);
        setAttrDefs(d);
        setPivot(pivotStock(cells));
        setError(null);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey, reloadKey]);

  // Модал нээгдэхэд тухайн бараа × салбарын идэвхтэй EPC татна.
  useEffect(() => {
    if (!modal) return;
    let active = true;
    const branchId = modal.branchKey === NO_BRANCH_KEY ? null : modal.branchKey;
    fetchActiveEpcs(modal.product.id, branchId)
      .then((d) => active && setModalEpcs(d))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [modal]);

  function openModal(product: ProductRow, branchKey: string, label: string) {
    setModalEpcs(null);
    setModal({ product, branchKey, label });
  }

  // Салбаргүй (branch_id null) active stock байгаа эсэх — байвал нэмэлт багана.
  const hasNoBranch = useMemo(
    () => [...pivot.values()].some((m) => (m.get(NO_BRANCH_KEY) ?? 0) > 0),
    [pivot]
  );

  // Салбарын баганууд (жагсаалт дараалалаар + Салбаргүй). Хуваарилагдсан
  // салбарууд байвал зөвхөн тэдгээрийг (RLS бусдыг 0 болгодог ч илүүдэхгүй).
  const branchDefs = useMemo(() => {
    const mine = allowedBranches ? branches.filter((b) => allowedBranches.includes(b.id)) : branches;
    const list = mine.map((b) => ({ key: b.id, label: b.name }));
    if (hasNoBranch) list.push({ key: NO_BRANCH_KEY, label: t("inventory.noBranch") });
    return list;
  }, [branches, hasNoBranch, allowedBranches, t]);

  // Зөвхөн ХАРАГДАЖ буй салбарын түлхүүрүүд (Нийт/үнэ эдгээрээр л тооцно).
  const visibleBranchKeys = useMemo(
    () => branchDefs.filter((b) => columnVisibility[`br:${b.key}`] !== false).map((b) => b.key),
    [branchDefs, columnVisibility]
  );

  // Харагдаж буй салбаруудын нийлбэр тоо / үнийн дүн.
  const qtyOf = useCallback(
    (p: ProductRow) => visibleBranchKeys.reduce((s, k) => s + (pivot.get(p.id)?.get(k) ?? 0), 0),
    [visibleBranchKeys, pivot]
  );
  const valueOf = useCallback((p: ProductRow) => qtyOf(p) * (p.price ?? 0), [qtyOf]);

  const columnsMeta = useMemo<Col[]>(() => {
    const info: Col[] = [
      { key: "name", label: t("common.product"), kind: "info", get: (p) => p.name ?? "" },
      { key: "cat1", label: t("inventory.mainCategory"), kind: "info", get: (p) => p.category_l1 ?? "" },
      { key: "cat2", label: t("inventory.subCategory"), kind: "info", get: (p) => p.category_l2 ?? "" },
      { key: "cat3", label: t("inventory.productCategory"), kind: "info", get: (p) => p.category_l3 ?? "" },
      { key: "sku", label: "SKU", kind: "info", get: (p) => p.sku ?? "", mono: true },
      { key: "gtin", label: t("inventory.gtinBarcode"), kind: "info", get: (p) => p.gtin ?? "", mono: true },
      { key: "price", label: t("common.price"), kind: "info", num: true, get: (p) => (p.price != null ? String(p.price) : "") },
      // Динамик шинж чанар (Өнгө/Размер/Төрөл…) — нэргүй вариантуудыг ялгахад.
      ...dedupAttrs(attrDefs).map<Col>((d) => ({
        key: `attr:${d.label}`,
        label: d.label,
        kind: "info",
        get: (p) => p.attributes?.[d.label] ?? "",
      })),
    ];
    const branchCols: Col[] = branchDefs.map((b) => ({
      key: `br:${b.key}`,
      label: b.label,
      kind: "branch",
      num: true,
      branchKey: b.key,
      get: (p) => String(pivot.get(p.id)?.get(b.key) ?? 0),
    }));
    const total: Col = { key: "total", label: t("common.total"), kind: "total", num: true, get: (p) => String(qtyOf(p)) };
    const totalValue: Col = {
      key: "value",
      label: t("inventory.totalValueCol"),
      kind: "total",
      num: true,
      get: (p) => String(valueOf(p)),
    };
    return [...info, ...branchCols, total, totalValue];
  }, [branchDefs, attrDefs, pivot, qtyOf, valueOf, t]);

  const infoCols = useMemo(() => columnsMeta.filter((c) => c.kind === "info"), [columnsMeta]);

  const tableOpts = useMemo<ClientTableOpts<ProductRow>>(
    () => ({
      // Ерөнхий хайлт зөвхөн мэдээллийн баганаар (тоон нүднүүд утгагүй).
      searchValues: (p) => infoCols.map((c) => c.get(p)),
      sorters: Object.fromEntries(
        columnsMeta.map((c) => [c.key, c.num ? (p: ProductRow) => Number(c.get(p) || 0) : c.get])
      ),
      filterValues: Object.fromEntries(infoCols.map((c) => [c.key, c.get])),
    }),
    [columnsMeta, infoCols]
  );

  // Үлдэгдэлгүйг нуух сонголт (showAll = false бол зөвхөн тоотой мөрүүд).
  const baseRows = useMemo(
    () => (showAll ? rows : rows.filter((p) => qtyOf(p) > 0)),
    [rows, showAll, qtyOf]
  );

  const fetchDataFn = useCallback(
    async (p: ClientPageParams) => {
      // Дээд мөрийн нэгтгэлийг ижил шүүлтээр (хуудсаар биш БҮГДЭЭР) тооцно.
      const matched = clientFilter(baseRows, p, tableOpts, filters);
      setSummary({
        count: matched.length,
        qty: matched.reduce((s, x) => s + qtyOf(x), 0),
        value: matched.reduce((s, x) => s + valueOf(x), 0),
      });
      return clientFetchResult(baseRows as Row[], p, tableOpts as ClientTableOpts<Row>, filters);
    },
    [baseRows, tableOpts, filters, qtyOf, valueOf]
  );

  const getColumns = useCallback(
    (): ColumnDef<Row, unknown>[] =>
      columnsMeta.map((c) => ({
        id: c.key,
        accessorFn: (row: Row) => c.get(row),
        header: ({ column }) => <DataTableColumnHeader column={column} title={c.label} />,
        cell: ({ row }) => {
          const p = row.original;
          const v = c.get(p);
          const n = Number(v);
          // Тоон баганыг таслалтай харуулна (эрэмбэ/шүүлт түүхий утгаар).
          const disp = c.num && v !== "" ? formatMoney(n) : v;
          if (c.kind === "branch" && n > 0)
            return (
              <button
                onClick={() => openModal(p, c.branchKey!, c.label)}
                className="block w-full text-right font-medium tabular-nums text-indigo-600 hover:underline"
                title={t("inventory.viewActiveEpcs")}
              >
                {disp}
              </button>
            );
          if (c.num && n === 0) return <span className="block text-right text-slate-300">—</span>;
          if (!v) return <span className="text-slate-300">—</span>;
          return (
            <span
              className={
                (c.mono ? "font-mono text-xs " : "") +
                (c.num ? "block text-right tabular-nums " : "") +
                (c.kind === "total" ? "font-semibold text-slate-900" : "")
              }
            >
              {disp}
            </span>
          );
        },
        size: c.kind === "info" ? (c.key === "name" ? 200 : 130) : 110,
      })),
    [columnsMeta, t]
  );

  const exportConfig = useMemo(() => {
    const mapping = Object.fromEntries(columnsMeta.map((c) => [c.key, c.label]));
    const headers = Object.keys(mapping);
    return {
      entityName: "inventory",
      columnMapping: mapping,
      columnWidths: headers.map(() => ({ wch: 16 })),
      headers,
      // Тоон утга ТҮҮХИЙ (Excel-д танигдана), attributes объект орохгүй.
      transformFunction: (row: Row) => {
        const out: Record<string, string | number> = {};
        for (const c of columnsMeta) out[c.key] = c.num ? Number(c.get(row) || 0) : c.get(row);
        return out;
      },
    };
  }, [columnsMeta]);

  const setF = (k: string, v: string) =>
    setFilters((f) => {
      const n = { ...f };
      if (v) n[k] = v;
      else delete n[k];
      return n;
    });
  const activeFilterCount = Object.keys(filters).length;

  const filterRow = (columnId: string) => {
    const c = columnsMeta.find((x) => x.key === columnId);
    if (!c || c.kind !== "info") return null;
    return (
      <input
        value={filters[columnId] ?? ""}
        onChange={(e) => setF(columnId, e.target.value)}
        placeholder="…"
        className="w-full rounded border border-slate-200 px-1.5 py-1 text-xs font-normal text-slate-900 outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
      />
    );
  };

  /** Модалын EPC жагсаалтыг CSV болгож татна — толгойд бараа/SKU/баркод/салбар. */
  function handleModalExport() {
    if (!modal || !modalEpcs || modalEpcs.length === 0) return;
    const p = modal.product;
    const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    const head = [
      [t("common.product"), p.name ?? ""],
      ["SKU", p.sku ?? ""],
      [t("common.barcode"), p.gtin ?? ""],
      [t("common.branch"), modal.label],
      [t("inventory.activeEpc"), String(modalEpcs.length)],
    ]
      .map(([k, v]) => `${esc(k)},${esc(v)}`)
      .join("\r\n");
    const table = toCsv(
      modalEpcs.map((e) => ({
        epc: e.epc_hex,
        serial: e.serial,
        created: new Date(e.created_at).toLocaleString(),
      })),
      [
        { key: "epc", label: "EPC (hex)" },
        { key: "serial", label: "Serial" },
        { key: "created", label: t("inventory.createdAt") },
      ]
    );
    const safe = (p.sku || p.name || "baraa").replace(/[^\w.-]+/g, "_");
    downloadCsv(`epc-${safe}-${new Date().toISOString().slice(0, 10)}.csv`, head + "\r\n\r\n" + table);
    void logAuditEvent(supabase, "export_csv", "inventory_epcs", p.id, { count: modalEpcs.length });
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">{t("inventory.subtitle")}</p>
        <div className="flex-1" />
        <span className="text-sm text-slate-600">
          <strong>{summary.count.toLocaleString()}</strong> {t("inventory.productsUnit")} ·{" "}
          {t("inventory.qtyPieces", { qty: summary.qty.toLocaleString() })} ·{" "}
          <strong>{t("inventory.amountCurrency", { amount: summary.value.toLocaleString() })}</strong>
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {t("inventory.showAll")}
        </label>
        <button
          onClick={() => setReloadKey((k) => k + 1)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
        >
          <RefreshCw size={14} className="inline align-text-bottom" /> {t("inventory.refresh")}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {activeFilterCount > 0 && (
        <p className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-1.5 text-xs text-slate-500">
          <ListFilter size={13} />
          <span>{t("dataTable.filterActive", { n: activeFilterCount })}</span>
          <span className="flex-1" />
          <button className="text-slate-400 hover:text-slate-700 hover:underline" onClick={() => setFilters({})}>
            {t("dataTable.reset")}
          </button>
        </p>
      )}

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
          {t("common.loading")}
        </p>
      ) : (
        <DataTable<Row, unknown>
          getColumns={getColumns}
          fetchDataFn={fetchDataFn}
          filterRow={filterRow}
          onColumnVisibilityChange={setColumnVisibility}
          exportConfig={exportConfig}
          idField="id"
          pageSizeOptions={[25, 50, 100, 250]}
          config={{
            enableRowSelection: false,
            enableSearch: true,
            enableDateFilter: false,
            enableColumnFilters: false,
            enableColumnVisibility: true,
            enableColumnResizing: true,
            enableExport: true,
            enableUrlState: false,
            enableKeyboardNavigation: true,
            size: "sm",
            columnResizingTableId: "inventory-data-table",
            searchPlaceholder: t("inventory.searchPh"),
            defaultSortBy: "total",
            defaultSortOrder: "desc",
          }}
        />
      )}

      {modal && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setModal(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">
                  {modal.product.name || modal.product.sku || t("common.product")} — {modal.label}
                </h3>
                <p className="text-xs text-slate-500">
                  {modal.product.sku && <>SKU: <span className="font-mono">{modal.product.sku}</span> · </>}
                  {modal.product.gtin && <>{t("common.barcode")}: <span className="font-mono">{modal.product.gtin}</span> · </>}
                  {t("inventory.activeEpc")} {modalEpcs ? `(${modalEpcs.length})` : "…"}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleModalExport}
                  disabled={!modalEpcs || modalEpcs.length === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {t("common.exportCsv")}
                </button>
                <button onClick={() => setModal(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X size={16} /></button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              {!modalEpcs ? (
                <p className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</p>
              ) : modalEpcs.length === 0 ? (
                <p className="px-4 py-10 text-center text-slate-400">{t("inventory.noActiveEpcs")}</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">EPC (hex)</th>
                      <th className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">Serial</th>
                      <th className="sticky top-0 border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t("inventory.createdAt")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {modalEpcs.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50">
                        <td className="border-b border-slate-100 px-3 py-1.5 font-mono text-xs text-slate-700">{e.epc_hex}</td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-right tabular-nums text-slate-700">{e.serial}</td>
                        <td className="border-b border-slate-100 px-3 py-1.5 text-slate-700">{new Date(e.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
