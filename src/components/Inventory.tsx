import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { formatMoney } from "../lib/format";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

interface Props {
  refreshKey?: number;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). Салбарын багануудыг шүүнэ. */
  allowedBranches?: string[] | null;
}

// Матрицын багана: info (барааны мэдээлэл), branch (салбар), total (Нийт/Нийт үнэ).
interface Col {
  key: string;
  label: string;
  kind: "info" | "branch" | "total";
  get: (p: ProductRow) => string;
  num?: boolean;
  mono?: boolean;
  branchKey?: string; // branch төрлийн баганад
}

const PAGE_SIZE = 100;
const HIDDEN_KEY = "inventoryHiddenCols";
function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Үлдэгдэл (Phase 4) — Идэвхтэй EPC-ийн тоо, бараа × салбар матрицаар. Зөвхөн унших. */
export default function Inventory({ refreshKey = 0, allowedBranches = null }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([]);
  const [pivot, setPivot] = useState<Map<string, Map<string, number>>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>({
    key: "total",
    dir: "desc",
  });
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [showColPicker, setShowColPicker] = useState(false);
  const [showAll, setShowAll] = useState(false); // false = зөвхөн үлдэгдэлтэй

  // EPC жагсаалтын модал (тухайн бараа × салбар).
  const [modal, setModal] = useState<{ product: ProductRow; branchKey: string; label: string } | null>(null);
  const [modalEpcs, setModalEpcs] = useState<ActiveEpc[] | null>(null);

  function reload() {
    setLoading(true);
    Promise.all([listProducts(), listBranches(), listAttributeDefs(), fetchStockByBranch()])
      .then(([p, b, d, cells]) => {
        setRows(p);
        setBranches(b);
        setAttrDefs(d);
        setPivot(pivotStock(cells));
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    Promise.all([listProducts(), listBranches(), listAttributeDefs(), fetchStockByBranch()])
      .then(([p, b, d, cells]) => {
        if (!active) return;
        setRows(p);
        setBranches(b);
        setAttrDefs(d);
        setPivot(pivotStock(cells));
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Модал нээгдэхэд тухайн бараа × салбарын идэвхтэй EPC татна.
  // (modalEpcs-ийг нээх товч цэвэрлэдэг тул энд синхрон setState хийхгүй.)
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

  // Салбарын баганууд (жагсаалт дараалалаар + Салбаргүй).
  // Хуваарилагдсан салбарууд байвал зөвхөн тэдгээрийг багана болгоно
  // (RLS аль хэдийн бусдыг 0 болгодог ч хоосон багана илүүдэхгүй).
  const branchDefs = useMemo(() => {
    const mine = allowedBranches ? branches.filter((b) => allowedBranches.includes(b.id)) : branches;
    const list = mine.map((b) => ({ key: b.id, label: b.name }));
    if (hasNoBranch) list.push({ key: NO_BRANCH_KEY, label: t("inventory.noBranch") });
    return list;
  }, [branches, hasNoBranch, allowedBranches, t]);

  // Зөвхөн ХАРАГДАЖ буй салбарын түлхүүрүүд (Нийт/үнэ эдгээрээр л тооцно).
  const visibleBranchKeys = useMemo(
    () => branchDefs.filter((b) => !hidden.has(`br:${b.key}`)).map((b) => b.key),
    [branchDefs, hidden]
  );

  // Харагдаж буй салбаруудын нийлбэр тоо / үнийн дүн.
  const qtyOf = (p: ProductRow) =>
    visibleBranchKeys.reduce((s, k) => s + (pivot.get(p.id)?.get(k) ?? 0), 0);
  const valueOf = (p: ProductRow) => qtyOf(p) * (p.price ?? 0);

  const columns = useMemo<Col[]>(() => {
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [branchDefs, attrDefs, pivot, visibleBranchKeys, t]);

  const visibleColumns = useMemo(() => columns.filter((c) => !hidden.has(c.key)), [columns, hidden]);

  function toggleColumn(key: string) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
      } catch {
        /* үл хамаарна */
      }
      return n;
    });
  }

  // Зөвхөн info баганаар текст шүүлт.
  const activeFilters = useMemo(
    () =>
      columns
        .filter((c) => c.kind === "info")
        .map((c) => ({ c, q: (filters[c.key] ?? "").trim().toLowerCase() }))
        .filter((f) => f.q),
    [columns, filters]
  );

  const base = useMemo(
    () => (showAll ? rows : rows.filter((p) => qtyOf(p) > 0)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rows, showAll, visibleBranchKeys, pivot]
  );
  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return base;
    return base.filter((p) => activeFilters.every((f) => f.c.get(p).toLowerCase().includes(f.q)));
  }, [base, activeFilters]);
  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) =>
      col.num
        ? (Number(col.get(a) || 0) - Number(col.get(b) || 0)) * dir
        : col.get(a).localeCompare(col.get(b), undefined, { numeric: true }) * dir
    );
  }, [filtered, sort, columns]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Харагдаж буй бүх мөрийн нийт тоо / үнийн дүн (footer/толгой).
  const totalQty = useMemo(
    () => sorted.reduce((s, p) => s + qtyOf(p), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, visibleBranchKeys, pivot]
  );
  const totalValue = useMemo(
    () => sorted.reduce((s, p) => s + valueOf(p), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [sorted, visibleBranchKeys, pivot]
  );

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }
  function toggleSort(key: string) {
    setSort((s) => (s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
    setPage(0);
  }

  function handleExport() {
    const cols = visibleColumns.map((c) => ({ key: c.key, label: c.label }));
    const flat = sorted.map((p) => Object.fromEntries(visibleColumns.map((c) => [c.key, c.get(p)])));
    const csv = toCsv(flat, cols);
    downloadCsv(`udldegdel-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "inventory", null, { count: sorted.length });
  }

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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("inventory.title")}</h2>
          <p className="text-sm text-slate-500">{t("inventory.subtitle")}</p>
        </div>
        <div className="flex-1" />
        <span className="text-sm text-slate-600">
          <strong>{sorted.length.toLocaleString()}</strong> {t("inventory.productsUnit")} ·{" "}
          {t("inventory.qtyPieces", { qty: totalQty.toLocaleString() })} ·{" "}
          <strong>{t("inventory.amountCurrency", { amount: totalValue.toLocaleString() })}</strong>
        </span>
        <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          <input type="checkbox" checked={showAll} onChange={(e) => setShowAll(e.target.checked)} />
          {t("inventory.showAll")}
        </label>
        <div className="relative">
          <button onClick={() => setShowColPicker((s) => !s)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            ⚙ {t("inventory.columns")}
          </button>
          {showColPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-60 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{t("inventory.visibleColumns")}</div>
                {columns.map((c) => (
                  <label key={c.key} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50">
                    <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggleColumn(c.key)} />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
        <button onClick={handleExport} disabled={sorted.length === 0} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
          {t("inventory.exportCsvCount", { n: sorted.length.toLocaleString() })}
        </button>
        <button onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          ↻ {t("inventory.refresh")}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className={
                    "sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 align-top last:border-r-0 " +
                    (c.num ? "text-right" : "text-left") +
                    (c.kind === "total" ? " bg-slate-100" : "")
                  }
                >
                  <button
                    onClick={() => toggleSort(c.key)}
                    className={
                      "mb-1 flex min-h-[32px] items-start gap-1 text-left text-xs font-semibold uppercase leading-4 tracking-wide text-slate-500 hover:text-indigo-600 " +
                      (c.num ? "ml-auto" : "")
                    }
                  >
                    {c.label}
                    <span className="text-[10px] text-slate-400">{sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                  {c.kind === "info" ? (
                    <input
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      placeholder={t("inventory.filterPlaceholder")}
                      className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    />
                  ) : (
                    <div className="h-[26px]" />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={visibleColumns.length} className="px-4 py-10 text-center text-slate-400">{showAll ? t("inventory.noProducts") : t("inventory.noStock")}</td></tr>
            ) : (
              visible.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  {visibleColumns.map((c) => {
                    const v = c.get(p);
                    const n = Number(v);
                    const isZero = c.num && n === 0;
                    const clickable = c.kind === "branch" && n > 0;
                    // Тоон баганыг таслалтай харуулна (эрэмбэ/шүүлт түүхий утгаар).
                    const disp = c.num && v !== "" ? formatMoney(n) : v;
                    return (
                      <td
                        key={c.key}
                        className={
                          "whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0" +
                          (c.mono ? " font-mono text-xs" : "") +
                          (c.num ? " text-right tabular-nums" : "") +
                          (c.kind === "total" ? " bg-slate-50 font-semibold text-slate-900" : "")
                        }
                      >
                        {clickable ? (
                          <button
                            onClick={() => openModal(p, c.branchKey!, c.label)}
                            className="font-medium text-indigo-600 hover:underline"
                            title={t("inventory.viewActiveEpcs")}
                          >
                            {disp}
                          </button>
                        ) : isZero ? (
                          <span className="text-slate-300">—</span>
                        ) : (
                          disp || <span className="text-slate-300">—</span>
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

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage(0)} disabled={safePage === 0} className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">«</button>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">{t("common.prev")}</button>
          <span className="px-2 text-slate-600">{t("inventory.page")} <strong>{safePage + 1}</strong> / {pageCount}</span>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">{t("common.next")}</button>
          <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">»</button>
        </div>
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
                <button onClick={() => setModal(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
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
