import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { listProducts, deleteProduct, type ProductRow } from "../lib/products";
import { generateEpcsForProduct } from "../lib/createProduct";
import { listAttributeDefs, dedupAttrs, type AttributeDef } from "../lib/catalog";
import { listBranches, type Branch } from "../lib/branches";
import { errorMessage } from "../lib/errorMessage";
import ProductForm from "./ProductForm";

interface Props {
  isAdmin: boolean;
  onEpcsGenerated?: () => void;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). EPC үүсгэх сонголтыг шүүнэ. */
  allowedBranches?: string[] | null;
}

interface ColDef {
  key: string;
  label: string;
  get: (p: ProductRow) => string;
  mono?: boolean;
  num?: boolean;
}

const STATIC_COLUMNS: ColDef[] = [
  { key: "name", label: "Бараа", get: (p) => p.name ?? "" },
  { key: "cat1", label: "Үндсэн ангилал", get: (p) => p.category_l1 ?? "" },
  { key: "cat2", label: "Дэд ангилал", get: (p) => p.category_l2 ?? "" },
  { key: "cat3", label: "Барааны ангилал", get: (p) => p.category_l3 ?? "" },
  { key: "sku", label: "SKU", get: (p) => p.sku ?? "", mono: true },
  { key: "gtin", label: "GTIN/баркод", get: (p) => p.gtin ?? "", mono: true },
  { key: "price", label: "Үнэ", get: (p) => (p.price != null ? String(p.price) : ""), num: true },
  { key: "stock", label: "Үлдэгдэл", get: (p) => String(p.active_count), num: true },
];

const PAGE_SIZE = 100;
const HIDDEN_KEY = "productHiddenCols";
function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** Бүтээгдэхүүн (master) таб — бүрэн боломжит хүснэгт (шүүлт/sort/хуудас/багана). */
export default function ProductList({ isAdmin, onEpcsGenerated, allowedBranches = null }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [filters, setFilters] = useState<Record<string, string>>({});
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(0);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [showColPicker, setShowColPicker] = useState(false);

  const [branches, setBranches] = useState<Branch[]>([]);
  const [form, setForm] = useState<ProductRow | "new" | null>(null);
  const [genFor, setGenFor] = useState<ProductRow | null>(null);
  const [genQty, setGenQty] = useState("1");
  const [genBranch, setGenBranch] = useState<string>("");
  const [genBusy, setGenBusy] = useState(false);

  function reload() {
    setLoading(true);
    Promise.all([listProducts(), listAttributeDefs()])
      .then(([p, d]) => {
        setRows(p);
        setAttrDefs(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
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

  const columns = useMemo<ColDef[]>(() => {
    const attrCols: ColDef[] = dedupAttrs(attrDefs).map((d) => ({
      key: `attr:${d.label}`,
      label: d.label,
      get: (p: ProductRow) => p.attributes?.[d.label] ?? "",
    }));
    return [...STATIC_COLUMNS, ...attrCols];
  }, [attrDefs]);
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

  const activeFilters = useMemo(
    () => columns.map((c) => ({ c, q: (filters[c.key] ?? "").trim().toLowerCase() })).filter((f) => f.q),
    [columns, filters]
  );
  const filtered = useMemo(() => {
    if (activeFilters.length === 0) return rows;
    return rows.filter((p) => activeFilters.every((f) => f.c.get(p).toLowerCase().includes(f.q)));
  }, [rows, activeFilters]);
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

  function setFilter(key: string, value: string) {
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0);
  }
  function toggleSort(key: string) {
    setSort((s) => (s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }));
    setPage(0);
  }

  function handleDelete(p: ProductRow) {
    // EPC бол түүхэн дата — бүртгэлтэй бол устгахыг урьдчилан хориглоно.
    if (p.epc_count > 0) {
      setError(
        `"${p.name}" бараанд ${p.epc_count} ширхэг EPC бүртгэлтэй тул устгах боломжгүй. ` +
          "Эхлээд холбогдох Ажлыг устгаж EPC-г цэвэрлэнэ үү."
      );
      return;
    }
    if (!window.confirm(`"${p.name}" барааг устгах уу?`)) return;
    deleteProduct(p.id)
      .then(reload)
      .catch((e) => setError(errorMessage(e)));
  }

  async function handleGenerate() {
    if (!genFor) return;
    const qty = Math.max(1, parseInt(genQty || "0", 10) || 0);
    if (qty < 1) {
      setError("Тоо ширхэг оруулна уу.");
      return;
    }
    setGenBusy(true);
    setError(null);
    try {
      const count = await generateEpcsForProduct(supabase, genFor.id, qty, genBranch || null);
      setInfo(`"${genFor.name}" бараанд ${count} EPC үүслээ.`);
      setGenFor(null);
      setGenQty("1");
      reload();
      onEpcsGenerated?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Бүтээгдэхүүн</h2>
          <p className="text-sm text-slate-500">
            Бараагаа энд бүртгэнэ. EPC-г дараа нь "EPC үүсгэх"-ээр тоо ширхгээр нь үүсгэнэ.
          </p>
        </div>
        <div className="flex-1" />
        <span className="text-sm text-slate-600">
          {activeFilters.length > 0 ? "Шүүсэн" : "Нийт"} <strong>{sorted.length.toLocaleString()}</strong>
        </span>
        {/* Багана сонгогч */}
        <div className="relative">
          <button onClick={() => setShowColPicker((s) => !s)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
            ⚙ Багана
          </button>
          {showColPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-60 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Харагдах багана</div>
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
        <button onClick={() => setForm("new")} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
          + Бараа нэмэх
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              {visibleColumns.map((c) => (
                <th key={c.key} className="sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left align-top last:border-r-0">
                  <button onClick={() => toggleSort(c.key)} className="mb-1 flex min-h-[32px] items-start gap-1 text-left text-xs font-semibold uppercase leading-4 tracking-wide text-slate-500 hover:text-indigo-600">
                    {c.label}
                    <span className="text-[10px] text-slate-400">{sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}</span>
                  </button>
                  <input
                    value={filters[c.key] ?? ""}
                    onChange={(e) => setFilter(c.key, e.target.value)}
                    placeholder="Шүүх…"
                    className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  />
                </th>
              ))}
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-3 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                Үйлдэл
              </th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-10 text-center text-slate-400">Ачаалж байна…</td></tr>
            ) : visible.length === 0 ? (
              <tr><td colSpan={visibleColumns.length + 1} className="px-4 py-10 text-center text-slate-400">{rows.length === 0 ? 'Бараа алга. "+ Бараа нэмэх" дарж эхэл.' : "Тохирох бараа алга."}</td></tr>
            ) : (
              visible.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  {visibleColumns.map((c) => {
                    const v = c.get(p);
                    return (
                      <td key={c.key} className={"whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0" + (c.mono ? " font-mono" : "") + (c.num ? " text-right" : "")}>
                        {v || <span className="text-slate-300">—</span>}
                      </td>
                    );
                  })}
                  <td className="whitespace-nowrap border-b border-slate-100 bg-white px-3 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setGenFor(p); setGenQty("1"); }} className="text-xs font-medium text-indigo-600 hover:underline">EPC үүсгэх</button>
                      {isAdmin && (
                        <>
                          <button onClick={() => setForm(p)} className="text-xs text-slate-500 hover:underline">Засах</button>
                          <button onClick={() => handleDelete(p)} className="text-xs text-red-600 hover:underline">Устгах</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button onClick={() => setPage(0)} disabled={safePage === 0} className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">«</button>
          <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={safePage === 0} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">Өмнөх</button>
          <span className="px-2 text-slate-600">Хуудас <strong>{safePage + 1}</strong> / {pageCount}</span>
          <button onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))} disabled={safePage >= pageCount - 1} className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">Дараах</button>
          <button onClick={() => setPage(pageCount - 1)} disabled={safePage >= pageCount - 1} className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40">»</button>
        </div>
      )}

      {/* Үүсгэх/засах форм */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{form === "new" ? "Бараа нэмэх" : "Бараа засах"}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <ProductForm initial={form === "new" ? null : form} onSaved={() => { setForm(null); reload(); }} onCancel={() => setForm(null)} />
          </div>
        </div>
      )}

      {/* EPC үүсгэх диалог */}
      {genFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">EPC үүсгэх</h3>
            <p className="mb-4 text-sm text-slate-500"><strong>{genFor.name}</strong> — хэдэн ширхэг EPC үүсгэх вэ? (одоо {genFor.epc_count}ш)</p>
            {branches.length > 0 && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">Салбар</label>
                <select value={genBranch} onChange={(e) => setGenBranch(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                  {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
                </select>
              </div>
            )}
            <label className="mb-1 block text-xs font-medium text-slate-600">Тоо ширхэг</label>
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
              <button onClick={() => setGenFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Болих</button>
              <button onClick={handleGenerate} disabled={genBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {genBusy ? "Үүсгэж байна…" : "Үүсгэх"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
