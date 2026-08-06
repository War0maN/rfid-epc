// Бүтээгдэхүүн (master) таб — tnks-data-table суурьтай хүснэгт: client-side
// өгөгдөл (lib/clientTable) + ерөнхий хайлт, эвхэгддэг баганын шүүлт, эрэмбэ,
// баганын харагдац/өргөн (localStorage), CSV·Excel экспорт. Мөр бүрийн
// үйлдэл: EPC үүсгэх / Засах / Устгах (эрхээр нуугдана, DB давхар хамгаална).
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ColumnDef } from "@tanstack/react-table";
import { ChevronDown, ChevronRight, ListFilter, X } from "lucide-react";
import { DataTable } from "@/components/data-table/data-table";
import { DataTableColumnHeader } from "@/components/data-table/column-header";
import { supabase } from "../lib/supabaseClient";
import { listProducts, deleteProduct, type ProductRow } from "../lib/products";
import { generateEpcsForProduct } from "../lib/createProduct";
import { listAttributeDefs, dedupAttrs, type AttributeDef } from "../lib/catalog";
import { listBranches, type Branch } from "../lib/branches";
import { clientFetchResult, type ClientPageParams, type ClientTableOpts } from "../lib/clientTable";
import { errorMessage } from "../lib/errorMessage";
import ConfirmDialog from "./ConfirmDialog";
import { formatMoney } from "../lib/format";
import { makeCan } from "../lib/permissions";
import ProductForm from "./ProductForm";

interface Props {
  isAdmin: boolean;
  onEpcsGenerated?: () => void;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). EPC үүсгэх сонголтыг шүүнэ. */
  allowedBranches?: string[] | null;
  /** Олгосон эрхүүд (null = бүрэн). Товчнуудыг нуухад — DB давхар хамгаална. */
  perms?: string[] | null;
}

/** tnks-ийн ExportableData (index signature) шаардлагад нийцүүлсэн мөр. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Row = ProductRow & Record<string, any>;

interface ColMeta {
  key: string;
  label: string; // орчуулагдсан нэр
  get: (p: ProductRow) => string; // түүхий текст (хайлт/шүүлт/экспортод)
  num?: (p: ProductRow) => number | null; // тоон эрэмбэ/экспортод
  mono?: boolean;
  money?: boolean; // харуулахдаа мянгатын таслалтай
}

export default function ProductList({ isAdmin, onEpcsGenerated, allowedBranches = null, perms = null }: Props) {
  const { t } = useTranslation();
  const can = makeCan(perms);
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [confirmDlg, setConfirmDlg] = useState<{ message: string; action: () => void } | null>(null);

  // Эвхэгддэг баганын шүүлтийн самбар (client-side "агуулсан").
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<ProductRow | "new" | null>(null);
  const [genFor, setGenFor] = useState<ProductRow | null>(null);
  const [genQty, setGenQty] = useState("1");
  const [genBranch, setGenBranch] = useState<string>("");
  // Нийлүүлэгч — үүсэх ажилд бичигдэнэ (заавал биш).
  const [genSupplier, setGenSupplier] = useState("");
  const [genBusy, setGenBusy] = useState(false);

  function reload() {
    Promise.all([listProducts(), listAttributeDefs()])
      .then(([p, d]) => {
        setRows(p);
        setAttrDefs(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(() => {
    let active = true;
    Promise.all([listProducts(), listAttributeDefs(), listBranches()])
      .then(([p, d, all]) => {
        if (!active) return;
        setRows(p);
        setAttrDefs(d);
        // Хуваарилагдсан салбарууд байвал EPC үүсгэх сонголтыг шүүнэ.
        const b = allowedBranches ? all.filter((x) => allowedBranches.includes(x.id)) : all;
        setBranches(b);
        setGenBranch(b[0]?.id ?? "");
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [allowedBranches]);

  // Статик + динамик шинж чанарын багануудын нэг эх сурвалж (хүснэгт,
  // шүүлтийн самбар, экспорт гурвуулаа үүнээс).
  const columnsMeta = useMemo<ColMeta[]>(() => {
    const stat: ColMeta[] = [
      { key: "name", label: t("common.product"), get: (p) => p.name ?? "" },
      { key: "cat1", label: t("products.colCat1"), get: (p) => p.category_l1 ?? "" },
      { key: "cat2", label: t("products.colCat2"), get: (p) => p.category_l2 ?? "" },
      { key: "cat3", label: t("products.colCat3"), get: (p) => p.category_l3 ?? "" },
      { key: "sku", label: t("common.sku"), get: (p) => p.sku ?? "", mono: true },
      { key: "gtin", label: t("products.colGtin"), get: (p) => p.gtin ?? "", mono: true },
      { key: "price", label: t("common.price"), get: (p) => (p.price != null ? String(p.price) : ""), num: (p) => p.price, money: true },
      { key: "cost", label: t("common.cost"), get: (p) => (p.cost != null ? String(p.cost) : ""), num: (p) => p.cost, money: true },
      { key: "stock", label: t("products.colStock"), get: (p) => String(p.active_count), num: (p) => p.active_count },
    ];
    const attrs: ColMeta[] = dedupAttrs(attrDefs).map((d) => ({
      key: `attr:${d.label}`,
      label: d.label, // динамик шинж чанарын нэр — орчуулахгүй
      get: (p: ProductRow) => p.attributes?.[d.label] ?? "",
    }));
    return [...stat, ...attrs];
  }, [attrDefs, t]);

  const tableOpts = useMemo<ClientTableOpts<ProductRow>>(
    () => ({
      searchValues: (p) => columnsMeta.map((c) => c.get(p)),
      sorters: Object.fromEntries(columnsMeta.map((c) => [c.key, c.num ?? c.get])),
      filterValues: Object.fromEntries(columnsMeta.map((c) => [c.key, c.get])),
    }),
    [columnsMeta]
  );

  const fetchDataFn = useCallback(
    async (p: ClientPageParams) => clientFetchResult(rows as Row[], p, tableOpts as ClientTableOpts<Row>, filters),
    [rows, tableOpts, filters]
  );

  function handleDelete(p: ProductRow) {
    // EPC бол түүхэн дата — бүртгэлтэй бол устгахыг урьдчилан хориглоно.
    if (p.epc_count > 0) {
      setError(t("products.deleteBlocked", { name: p.name, epcCount: p.epc_count }));
      return;
    }
    setConfirmDlg({
      message: t("products.confirmDelete", { name: p.name }),
      action: () =>
        deleteProduct(p.id)
          .then(reload)
          .catch((e) => setError(errorMessage(e))),
    });
  }

  const getColumns = useCallback(
    (): ColumnDef<Row, unknown>[] => {
      const cols: ColumnDef<Row, unknown>[] = columnsMeta.map((c) => ({
        id: c.key,
        accessorFn: (row: Row) => c.get(row),
        header: ({ column }) => <DataTableColumnHeader column={column} title={c.label} />,
        cell: ({ row }) => {
          const v = c.get(row.original);
          if (!v) return <span className="text-slate-300">—</span>;
          const text = c.money ? formatMoney(Number(v)) : v;
          return <span className={(c.mono ? "font-mono text-xs " : "") + (c.num ? "block text-right tabular-nums" : "")}>{text}</span>;
        },
        size: c.key === "name" ? 200 : 120,
      }));
      cols.push({
        id: "actions",
        header: () => <span className="text-xs font-semibold uppercase tracking-wide">{t("common.actions")}</span>,
        enableSorting: false,
        enableHiding: false,
        cell: ({ row }) => {
          const p = row.original;
          return (
            <div className="flex justify-end gap-2">
              {can("act_import") && (
                <button
                  onClick={() => {
                    setGenFor(p);
                    setGenQty("1");
                  }}
                  className="text-xs font-medium text-indigo-600 hover:underline"
                >
                  {t("products.generateEpc")}
                </button>
              )}
              {isAdmin && (
                <>
                  <button onClick={() => setForm(p)} className="text-xs text-slate-500 hover:underline">
                    {t("common.edit")}
                  </button>
                  <button onClick={() => handleDelete(p)} className="text-xs text-red-600 hover:underline">
                    {t("common.delete")}
                  </button>
                </>
              )}
            </div>
          );
        },
        size: 180,
      });
      return cols;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columnsMeta, t, isAdmin, perms]
  );

  const exportConfig = useMemo(() => {
    const mapping = Object.fromEntries(columnsMeta.map((c) => [c.key, c.label]));
    const headers = Object.keys(mapping);
    return {
      entityName: "products",
      columnMapping: mapping,
      columnWidths: headers.map(() => ({ wch: 16 })),
      headers,
      // CSV/Excel-д тоон утга ТҮҮХИЙ (num), бусад нь текстээрээ; attributes
      // объект экспортод орохгүй — attr:* хавтгай баганууд нь орсон.
      transformFunction: (row: Row) => {
        const out: Record<string, string | number> = {};
        for (const c of columnsMeta) out[c.key] = c.num ? c.num(row) ?? "" : c.get(row);
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

  async function handleGenerate() {
    if (!genFor) return;
    const qty = Math.max(1, parseInt(genQty || "0", 10) || 0);
    if (qty < 1) {
      setError(t("products.qtyRequired"));
      return;
    }
    setGenBusy(true);
    setError(null);
    try {
      const count = await generateEpcsForProduct(
        supabase,
        genFor.id,
        qty,
        genBranch || null,
        genSupplier.trim() || null
      );
      setInfo(t("products.generatedInfo", { name: genFor.name, epcCount: count }));
      setGenFor(null);
      setGenQty("1");
      setGenSupplier("");
      reload();
      onEpcsGenerated?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">{t("products.subtitle")}</p>
        <div className="flex-1" />
        {can("act_product_edit") && (
          <button onClick={() => setForm("new")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            {t("products.addProduct")}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      {/* Баганын шүүлтүүд — client-side "агуулсан" (шинж чанарын баганууд ч мөн) */}
      <div className="rounded-lg border border-slate-200">
        <button
          className="flex w-full items-center gap-2 px-3 py-2 text-sm font-medium text-slate-700"
          onClick={() => setShowFilters((v) => !v)}
        >
          {showFilters ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <ListFilter size={14} />
          {t("dataTable.filterTitle")}
          {activeFilterCount > 0 && (
            <span className="rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-semibold text-indigo-700">
              {activeFilterCount}
            </span>
          )}
          <span className="flex-1" />
          {activeFilterCount > 0 && (
            <span
              role="button"
              className="text-xs text-slate-400 hover:text-slate-700 hover:underline"
              onClick={(e) => {
                e.stopPropagation();
                setFilters({});
              }}
            >
              {t("dataTable.reset")}
            </span>
          )}
        </button>
        {showFilters && (
          <div className="grid grid-cols-2 gap-2 border-t border-slate-100 p-3 md:grid-cols-4 lg:grid-cols-6">
            {columnsMeta.map((c) => (
              <label key={c.key} className="text-xs text-slate-500">
                {c.label}
                <input
                  value={filters[c.key] ?? ""}
                  onChange={(e) => setF(c.key, e.target.value)}
                  placeholder="…"
                  className="mt-0.5 block w-full rounded border border-slate-300 px-2 py-1 text-sm text-slate-900"
                />
              </label>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <p className="rounded-xl border border-slate-200 bg-white px-4 py-10 text-center text-sm text-slate-400 shadow-sm">
          {t("common.loading")}
        </p>
      ) : (
        <DataTable<Row, unknown>
          getColumns={getColumns}
          fetchDataFn={fetchDataFn}
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
            columnResizingTableId: "products-data-table",
            searchPlaceholder: t("products.searchPh"),
            defaultSortBy: "name",
            defaultSortOrder: "asc",
          }}
        />
      )}

      {/* Үүсгэх/засах форм */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{form === "new" ? t("products.addProductTitle") : t("products.editProductTitle")}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600"><X size={16} /></button>
            </div>
            <ProductForm initial={form === "new" ? null : form} onSaved={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
          </div>
        </div>
      )}

      {/* EPC үүсгэх диалог */}
      {genFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">{t("products.generateEpc")}</h3>
            <p className="mb-4 text-sm text-slate-500"><strong>{genFor.name}</strong> — {t("products.genQuestion")} ({t("products.genCurrent", { epcCount: genFor.epc_count })})</p>
            {branches.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">{t("common.branch")}</label>
                <select value={genBranch} onChange={(e) => setGenBranch(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
            )}
            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">{t("createJob.supplier")}</label>
              <input
                value={genSupplier}
                onChange={(e) => setGenSupplier(e.target.value)}
                placeholder={t("createJob.supplierPlaceholder")}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <label className="mb-1 block text-xs font-medium text-slate-600">{t("products.quantity")}</label>
            <input
              type="number"
              min={1}
              autoFocus
              value={genQty}
              onChange={(e) => setGenQty(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleGenerate()}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setGenFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">{t("products.dismiss")}</button>
              <button onClick={handleGenerate} disabled={genBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {genBusy ? t("products.generating") : t("products.generate")}
              </button>
            </div>
          </div>
        </div>
      )}

      {confirmDlg && (
        <ConfirmDialog
          message={confirmDlg.message}
          danger
          onCancel={() => setConfirmDlg(null)}
          onConfirm={() => {
            const a = confirmDlg.action;
            setConfirmDlg(null);
            a();
          }}
        />
      )}
    </div>
  );
}
