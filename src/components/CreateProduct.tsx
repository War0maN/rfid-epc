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

  // Ангилал — 3 холбоост (cascading) сонголт. Гүн нь сонгосон хамгийн доод түвшин.
  const [l1Id, setL1Id] = useState<string | null>(null);
  const [l2Id, setL2Id] = useState<string | null>(null);
  const [l3Id, setL3Id] = useState<string | null>(null);
  const categoryId = l3Id ?? l2Id ?? l1Id;
  const [name, setName] = useState("");
  const [sku, setSku] = useState("");
  const [price, setPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [attrValues, setAttrValues] = useState<Record<string, string>>({}); // def.id -> value
  // Урьдчилан тодорхойлоогүй нэмэлт шинж чанар (автоматаар бүртгэгдэнэ).
  const [extra, setExtra] = useState<{ label: string; value: string }[]>([]);

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

  // Cascading сонголтын тус бүрийн сонголтууд (эцэг id-ээр шүүж эрэмбэлнэ).
  const kids = (parentId: string | null) =>
    cats
      .filter((c) => c.parent_id === parentId)
      .sort((a, b) => a.sort - b.sort || a.name.localeCompare(b.name));
  const l1Opts = useMemo(() => kids(null), [cats]); // eslint-disable-line react-hooks/exhaustive-deps
  const l2Opts = useMemo(() => (l1Id ? kids(l1Id) : []), [cats, l1Id]); // eslint-disable-line react-hooks/exhaustive-deps
  const l3Opts = useMemo(() => (l2Id ? kids(l2Id) : []), [cats, l2Id]); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Нэмэлт (чөлөөт) шинж чанарууд — нэр+утга хоёулаа байвал.
    for (const ex of extra) {
      const l = ex.label.trim();
      const v = ex.value.trim();
      if (l && v) attributes[l] = v;
    }

    setBusy(true);
    try {
      const priceNum = price.trim() ? Number(price.replace(/[^0-9.]/g, "")) : null;
      const res = await createCatalogProductAndEpcs(supabase, {
        categoryId,
        name: name.trim(),
        sku: sku.trim() || null,
        price: priceNum != null && Number.isFinite(priceNum) ? priceNum : null,
        attributes,
        quantity,
      });
      setResult({ count: res.count });
      // Формыг хэсэгчлэн цэвэрлэх (ангиллыг үлдээж дараагийн бараанд хурдан)
      setName("");
      setSku("");
      setPrice("");
      setQuantity(1);
      setAttrValues({});
      setExtra([]);
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
            {/* Ангилал — 3 холбоост сонголт (заавал бүгдийг сонгох албагүй) */}
            <div className="mb-4">
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
              {l1Opts.length === 0 && (
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
              <div>
                <label className={lbl}>Үнэ</label>
                <input
                  type="number"
                  min={0}
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
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

            {/* Нэмэлт (чөлөөт) шинж чанар — автоматаар каталогт бүртгэгдэнэ */}
            <div className="mt-4 rounded-lg border border-dashed border-slate-300 p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Нэмэлт шинж чанар
                </span>
                <button
                  type="button"
                  onClick={() => setExtra((x) => [...x, { label: "", value: "" }])}
                  className="text-xs text-indigo-600 hover:underline"
                >
                  + Нэмэх
                </button>
              </div>
              {extra.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Жагсаалтад байхгүй шинж чанар (ж: Үнэ, Материал) нэмбэл автоматаар бүртгэгдэнэ.
                </p>
              ) : (
                <div className="space-y-2">
                  {extra.map((row, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={row.label}
                        onChange={(e) =>
                          setExtra((x) => x.map((r, j) => (j === i ? { ...r, label: e.target.value } : r)))
                        }
                        placeholder="Нэр (ж: Үнэ)"
                        className={inp + " max-w-[180px]"}
                      />
                      <input
                        value={row.value}
                        onChange={(e) =>
                          setExtra((x) => x.map((r, j) => (j === i ? { ...r, value: e.target.value } : r)))
                        }
                        placeholder="Утга (ж: 50000)"
                        className={inp}
                      />
                      <button
                        type="button"
                        onClick={() => setExtra((x) => x.filter((_, j) => j !== i))}
                        className="shrink-0 text-sm text-red-500 hover:text-red-700"
                        title="Хасах"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

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
