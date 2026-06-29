import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { listProducts, deleteProduct, type ProductRow } from "../lib/products";
import { generateEpcsForProduct } from "../lib/createProduct";
import { errorMessage } from "../lib/errorMessage";
import ProductForm from "./ProductForm";

interface Props {
  isAdmin: boolean;
  /** EPC үүсгэсний дараа EPC хүснэгтийг сэргээх. */
  onEpcsGenerated?: () => void;
}

function attrsText(a: Record<string, string>): string {
  return Object.keys(a)
    .sort()
    .map((k) => `${k}: ${a[k]}`)
    .join(" · ");
}
function catPath(p: ProductRow): string {
  return [p.category_l1, p.category_l2, p.category_l3].filter(Boolean).join(" / ");
}

/** Бүтээгдэхүүн (master) таб: жагсаалт, үлдэгдэл, үүсгэх/засах/устгах, EPC үүсгэх. */
export default function ProductList({ isAdmin, onEpcsGenerated }: Props) {
  const [rows, setRows] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [info, setInfo] = useState<string | null>(null);

  const [form, setForm] = useState<ProductRow | "new" | null>(null); // үүсгэх/засах форм
  const [genFor, setGenFor] = useState<ProductRow | null>(null); // EPC үүсгэх диалог
  const [genQty, setGenQty] = useState(1);
  const [genBusy, setGenBusy] = useState(false);

  function reload() {
    setLoading(true);
    listProducts()
      .then((d) => {
        setRows(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    listProducts()
      .then((d) => active && setRows(d))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) =>
      [r.name, r.sku, r.gtin, catPath(r), attrsText(r.attributes)]
        .filter(Boolean)
        .some((s) => String(s).toLowerCase().includes(q))
    );
  }, [rows, search]);

  function handleDelete(p: ProductRow) {
    const extra = p.epc_count > 0 ? ` (${p.epc_count} EPC хамт устана!)` : "";
    if (!window.confirm(`"${p.name}" барааг устгах уу?${extra}`)) return;
    deleteProduct(p.id)
      .then(reload)
      .catch((e) => setError(errorMessage(e)));
  }

  async function handleGenerate() {
    if (!genFor) return;
    setGenBusy(true);
    setError(null);
    try {
      const count = await generateEpcsForProduct(supabase, genFor.id, genQty);
      setInfo(`"${genFor.name}" бараанд ${count} EPC үүслээ.`);
      setGenFor(null);
      setGenQty(1);
      reload();
      onEpcsGenerated?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setGenBusy(false);
    }
  }

  const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "whitespace-nowrap border-b border-slate-100 px-3 py-2 text-slate-700";

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
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Хайх (нэр, sku, баркод, ангилал…)"
          className="w-64 rounded-lg border border-slate-300 px-3 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
        />
        <button
          onClick={() => setForm("new")}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
        >
          + Бараа нэмэх
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="sticky top-0 z-10">
            <tr>
              <th className={th}>Бараа</th>
              <th className={th}>Ангилал</th>
              <th className={th}>SKU</th>
              <th className={th}>Үнэ</th>
              <th className={th}>Шинж чанар</th>
              <th className={th + " text-right"}>Үлдэгдэл</th>
              <th className={th + " text-right"}>Үйлдэл</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">Ачаалж байна…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-10 text-center text-slate-400">{rows.length === 0 ? "Бараа алга. \"+ Бараа нэмэх\" дарж эхэл." : "Тохирох бараа алга."}</td></tr>
            ) : (
              filtered.map((p) => (
                <tr key={p.id} className="hover:bg-slate-50">
                  <td className={td}>
                    <div className="font-medium text-slate-800">{p.name || "—"}</div>
                    {p.gtin && <div className="font-mono text-xs text-slate-400">{p.gtin}</div>}
                  </td>
                  <td className={td}>{catPath(p) || <span className="text-slate-300">—</span>}</td>
                  <td className={td + " font-mono text-xs"}>{p.sku || "—"}</td>
                  <td className={td}>{p.price != null ? p.price.toLocaleString() : "—"}</td>
                  <td className={td + " max-w-[260px] truncate text-xs text-slate-500"}>{attrsText(p.attributes) || "—"}</td>
                  <td className={td + " text-right font-medium"}>{p.epc_count.toLocaleString()}</td>
                  <td className={td + " text-right"}>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => { setGenFor(p); setGenQty(1); }} className="text-xs font-medium text-indigo-600 hover:underline">
                        EPC үүсгэх
                      </button>
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

      {/* Үүсгэх/засах форм (modal) */}
      {form && (
        <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-black/40 p-4">
          <div className="my-8 w-full max-w-2xl rounded-xl bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">{form === "new" ? "Бараа нэмэх" : "Бараа засах"}</h3>
              <button onClick={() => setForm(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            <ProductForm
              initial={form === "new" ? null : form}
              onSaved={() => { setForm(null); reload(); }}
              onCancel={() => setForm(null)}
            />
          </div>
        </div>
      )}

      {/* EPC үүсгэх диалог */}
      {genFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl">
            <h3 className="mb-1 text-lg font-semibold text-slate-900">EPC үүсгэх</h3>
            <p className="mb-4 text-sm text-slate-500">
              <strong>{genFor.name}</strong> — хэдэн ширхэг EPC үүсгэх вэ? (одоо {genFor.epc_count}ш)
            </p>
            <input
              type="number"
              min={1}
              autoFocus
              value={genQty}
              onChange={(e) => setGenQty(Math.max(1, parseInt(e.target.value || "1", 10)))}
              className="mb-4 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setGenFor(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">Болих</button>
              <button onClick={handleGenerate} disabled={genBusy} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50">
                {genBusy ? "Үүсгэж байна…" : `${genQty}ш үүсгэх`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
