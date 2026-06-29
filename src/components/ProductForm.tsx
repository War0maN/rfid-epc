import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  listCategories,
  listAttributeDefs,
  attrsForCategory,
  CATEGORY_LEVELS,
  type Category,
  type AttributeDef,
} from "../lib/catalog";
import { upsertCatalogProduct } from "../lib/createProduct";
import type { ProductRow } from "../lib/products";
import { errorMessage } from "../lib/errorMessage";

const inp =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const lbl = "mb-1 block text-sm font-medium text-slate-700";

interface Props {
  initial?: ProductRow | null; // байвал засна
  onSaved: () => void;
  onCancel: () => void;
}

/** Leaf category id-ээс 3 түвшний id-г (дээдээс доош) гаргана. */
function resolveLevels(catId: string | null, cats: Category[]) {
  const byId = new Map(cats.map((c) => [c.id, c]));
  const chain: string[] = [];
  let cur = catId;
  while (cur && chain.length < 5) {
    chain.unshift(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  return { l1: chain[0] ?? null, l2: chain[1] ?? null, l3: chain[2] ?? null };
}

/** Бараа (master) үүсгэх/засах форм — EPC үүсгэхгүй. */
export default function ProductForm({ initial, onSaved, onCancel }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [defs, setDefs] = useState<AttributeDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [l1Id, setL1Id] = useState<string | null>(null);
  const [l2Id, setL2Id] = useState<string | null>(null);
  const [l3Id, setL3Id] = useState<string | null>(null);
  const categoryId = l3Id ?? l2Id ?? l1Id;
  const [name, setName] = useState(initial?.name ?? "");
  const [sku, setSku] = useState(initial?.sku ?? "");
  const [gtin, setGtin] = useState(initial?.gtin ?? "");
  const [price, setPrice] = useState(initial?.price != null ? String(initial.price) : "");
  const [attrValues, setAttrValues] = useState<Record<string, string>>({}); // def.id -> value
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ангилал + шинж чанарыг татаад, засвар бол утгуудыг урьдчилан бөглөнө.
  useEffect(() => {
    let active = true;
    Promise.all([listCategories(), listAttributeDefs()])
      .then(([c, d]) => {
        if (!active) return;
        setCats(c);
        setDefs(d);
        if (initial) {
          const lv = resolveLevels(initial.category_id, c);
          setL1Id(lv.l1);
          setL2Id(lv.l2);
          setL3Id(lv.l3);
          // attributes (label→утга) → attrValues (def.id→утга); тохирохгүйг extra-д
          const byLabel = new Map(d.map((x) => [x.label.trim().toLowerCase(), x]));
          const av: Record<string, string> = {};
          const ex: { label: string; value: string }[] = [];
          for (const [label, val] of Object.entries(initial.attributes ?? {})) {
            const def = byLabel.get(label.trim().toLowerCase());
            if (def) av[def.id] = val;
            else ex.push({ label, value: val });
          }
          setAttrValues(av);
          setExtra(ex);
        }
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, [initial]);

  const kids = (parentId: string | null) =>
    cats
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const l1Opts = useMemo(() => kids(null), [cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const l2Opts = useMemo(() => (l1Id ? kids(l1Id) : []), [cats, l1Id]); // eslint-disable-line react-hooks/exhaustive-deps
  const l3Opts = useMemo(() => (l2Id ? kids(l2Id) : []), [cats, l2Id]); // eslint-disable-line react-hooks/exhaustive-deps
  const attrs = useMemo(() => attrsForCategory(defs, categoryId, cats), [defs, categoryId, cats]);

  function setAttr(id: string, value: string) {
    setAttrValues((v) => ({ ...v, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    for (const a of attrs) {
      if (a.required && !(attrValues[a.id] ?? "").trim()) {
        setError(`"${a.label}" заавал бөглөнө.`);
        return;
      }
    }
    const attributes: Record<string, string> = {};
    for (const a of attrs) {
      const val = (attrValues[a.id] ?? "").trim();
      if (val) attributes[a.label] = val;
    }
    for (const ex of extra) {
      const l = ex.label.trim();
      const v = ex.value.trim();
      if (l && v) attributes[l] = v;
    }

    setBusy(true);
    try {
      const priceNum = price.trim() ? Number(price.replace(/[^0-9.]/g, "")) : null;
      await upsertCatalogProduct(supabase, {
        id: initial?.id,
        categoryId,
        name: name.trim(),
        sku: sku.trim() || null,
        gtin: gtin.trim() || null,
        price: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
        attributes,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-sm text-slate-400">Ачаалж байна…</p>;

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Ангилал — 3 холбоост */}
      <div>
        <label className={lbl}>Ангилал</label>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <select
            value={l1Id ?? ""}
            onChange={(e) => {
              setL1Id(e.target.value || null);
              setL2Id(null);
              setL3Id(null);
            }}
            className={inp}
          >
            <option value="">{CATEGORY_LEVELS[0]}…</option>
            {l1Opts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={l2Id ?? ""}
            onChange={(e) => {
              setL2Id(e.target.value || null);
              setL3Id(null);
            }}
            disabled={l2Opts.length === 0}
            className={inp + " disabled:bg-slate-50 disabled:text-slate-400"}
          >
            <option value="">{CATEGORY_LEVELS[1]}…</option>
            {l2Opts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
          <select
            value={l3Id ?? ""}
            onChange={(e) => setL3Id(e.target.value || null)}
            disabled={l3Opts.length === 0}
            className={inp + " disabled:bg-slate-50 disabled:text-slate-400"}
          >
            <option value="">{CATEGORY_LEVELS[2]}…</option>
            {l3Opts.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label className={lbl}>Барааны нэр <span className="text-red-500">*</span></label>
          <input required value={name} onChange={(e) => setName(e.target.value)} placeholder="Цамц" className={inp} />
        </div>
        <div>
          <label className={lbl}>SKU / код</label>
          <input value={sku} onChange={(e) => setSku(e.target.value)} placeholder="Заавал биш" className={inp} />
        </div>
        <div>
          <label className={lbl}>Үнэ</label>
          <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Заавал биш" className={inp} />
        </div>
        <div>
          <label className={lbl}>GTIN / баркод</label>
          <input value={gtin} onChange={(e) => setGtin(e.target.value)} placeholder="Заавал биш (байвал SGTIN-96)" className={inp + " font-mono"} />
        </div>
      </div>

      {/* Динамик шинж чанарууд */}
      {attrs.length > 0 && (
        <div className="rounded-lg border border-slate-200 bg-slate-50/60 p-3">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Шинж чанар</div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {attrs.map((a) => (
              <div key={a.id}>
                <label className={lbl}>{a.label}{a.required && <span className="text-red-500"> *</span>}</label>
                {a.input_type === "select" ? (
                  <select value={attrValues[a.id] ?? ""} onChange={(e) => setAttr(a.id, e.target.value)} className={inp}>
                    <option value="">— Сонгох —</option>
                    {a.options.map((opt) => (<option key={opt} value={opt}>{opt}</option>))}
                  </select>
                ) : (
                  <input type={a.input_type === "number" ? "number" : "text"} value={attrValues[a.id] ?? ""} onChange={(e) => setAttr(a.id, e.target.value)} className={inp} />
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Нэмэлт чөлөөт шинж чанар */}
      <div className="rounded-lg border border-dashed border-slate-300 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Нэмэлт шинж чанар</span>
          <button type="button" onClick={() => setExtra((x) => [...x, { label: "", value: "" }])} className="text-xs text-indigo-600 hover:underline">+ Нэмэх</button>
        </div>
        {extra.length === 0 ? (
          <p className="text-xs text-slate-400">Жагсаалтад байхгүй шинж чанар нэмбэл автоматаар бүртгэгдэнэ.</p>
        ) : (
          <div className="space-y-2">
            {extra.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <input value={row.label} onChange={(e) => setExtra((x) => x.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))} placeholder="Нэр" className={inp + " max-w-[180px]"} />
                <input value={row.value} onChange={(e) => setExtra((x) => x.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))} placeholder="Утга" className={inp} />
                <button type="button" onClick={() => setExtra((x) => x.filter((_, j) => j !== i))} className="shrink-0 text-sm text-red-500 hover:text-red-700">✕</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Болих
        </button>
        <button type="submit" disabled={busy || !name.trim()} className="rounded-lg bg-indigo-600 px-5 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60">
          {busy ? "Хадгалж байна…" : initial ? "Хадгалах" : "Бараа үүсгэх"}
        </button>
      </div>
    </form>
  );
}
