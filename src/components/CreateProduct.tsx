import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import {
  listCategories,
  listAttributeDefs,
  categoryOptions,
  attrsForCategory,
  type Category,
  type AttributeDef,
} from "../lib/catalog";
import { createCatalogProductAndEpcs } from "../lib/createProduct";
import { errorMessage } from "../lib/errorMessage";

const inp =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const lbl = "mb-1 block text-sm font-medium text-slate-700";

interface Props {
  onCreated?: () => void;
}

/** Каталог бараа үүсгэх: ангилал сонгоод динамик шинж чанар бөглөж EPC үүсгэнэ. */
export default function CreateProduct({ onCreated }: Props) {
  const [cats, setCats] = useState<Category[]>([]);
  const [defs, setDefs] = useState<AttributeDef[]>([]);
  const [loaded, setLoaded] = useState(false);

  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({}); // def.id -> value

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<{ count: number } | null>(null);

  useEffect(() => {
    let active = true;
    Promise.all([listCategories(), listAttributeDefs()])
      .then(([c, d]) => {
        if (!active) return;
        setCats(c);
        setDefs(d);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoaded(true));
    return () => {
      active = false;
    };
  }, []);

  const catOpts = useMemo(() => categoryOptions(cats), [cats]);
  const attrs = useMemo(
    () => attrsForCategory(defs, categoryId, cats),
    [defs, categoryId, cats]
  );

  function setAttr(id: string, value: string) {
    setAttrValues((v) => ({ ...v, [id]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    // Заавал шинж чанаруудыг шалгах
    for (const a of attrs) {
      if (a.required && !(attrValues[a.id] ?? "").trim()) {
        setError(`"${a.label}" заавал бөглөнө.`);
        return;
      }
    }
    // def.id -> утга-г label-ээр түлхүүрлэсэн объект болгох
    const attributes: Record<string, string> = {};
    for (const a of attrs) {
      const val = (attrValues[a.id] ?? "").trim();
      if (val) attributes[a.label] = val;
    }

    setBusy(true);
    try {
      const res = await createCatalogProductAndEpcs(supabase, {
        categoryId,
        name: name.trim(),
        sku: sku.trim() || null,
        attributes,
        quantity,
      });
      setResult({ count: res.count });
      // Формыг хэсэгчлэн цэвэрлэх (ангилал/шинж чанарыг үлдээж дараагийн бараанд хурдан)
      setName("");
      setSku("");
      setQuantity(1);
      setAttrValues({});
      onCreated?.();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Бараа үүсгэх</h2>
        <p className="mb-4 text-sm text-slate-500">
          Ангилал сонгоод шинж чанараа бөглөж, тоо ширхгээ өгөхөд тэр тооны RFID EPC (GID-96) үүснэ.
        </p>

        {!loaded ? (
          <p className="text-sm text-slate-400">Ачаалж байна…</p>
        ) : (
          <>
            {/* Ангилал */}
            <div className="mb-4">
              <label className={lbl}>Ангилал</label>
              <select
                value={categoryId ?? ""}
                onChange={(e) => {
                  setCategoryId(e.target.value || null);
                  setAttrValues({});
                }}
                className={inp}
              >
                <option value="">— Ангилалгүй (зөвхөн глобал шинж чанар) —</option>
                {catOpts.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {catOpts.length === 0 && (
                <p className="mt-1 text-xs text-amber-600">
                  Ангилал алга. "Ангилал" таб дээр эхлээд үүсгэвэл энд сонгож болно.
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label className={lbl}>
                  Барааны нэр <span className="text-red-500">*</span>
                </label>
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Цамц"
                  className={inp}
                />
              </div>
              <div>
                <label className={lbl}>SKU / код</label>
                <input
                  value={sku}
                  onChange={(e) => setSku(e.target.value)}
                  placeholder="Заавал биш"
                  className={inp}
                />
              </div>
            </div>

            {/* Динамик шинж чанарууд */}
            {attrs.length > 0 && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3">
                <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Шинж чанар
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {attrs.map((a) => (
                    <div key={a.id}>
                      <label className={lbl}>
                        {a.label}
                        {a.required && <span className="text-red-500"> *</span>}
                      </label>
                      {a.input_type === "select" ? (
                        <select
                          value={attrValues[a.id] ?? ""}
                          onChange={(e) => setAttr(a.id, e.target.value)}
                          className={inp}
                        >
                          <option value="">— Сонгох —</option>
                          {a.options.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={a.input_type === "number" ? "number" : "text"}
                          value={attrValues[a.id] ?? ""}
                          onChange={(e) => setAttr(a.id, e.target.value)}
                          className={inp}
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Тоо ширхэг */}
            <div className="mt-4 max-w-[200px]">
              <label className={lbl}>
                Тоо ширхэг <span className="text-red-500">*</span>
              </label>
              <input
                type="number"
                min={1}
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value || "1", 10)))}
                className={inp}
              />
            </div>

            {error && <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
            {result && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
                Амжилттай! <strong>{result.count}</strong> EPC үүслээ. "EPC хүснэгт" таб дээр харна уу.
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !name.trim()}
              className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 sm:w-auto sm:px-6"
            >
              {busy ? "Үүсгэж байна…" : `Бараа үүсгэж ${quantity}ш EPC генерацлэх`}
            </button>
          </>
        )}
      </form>
    </div>
  );
}
