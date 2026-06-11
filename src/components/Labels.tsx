import { useEffect, useState } from "react";
import {
  listTemplates,
  createTemplate,
  saveTemplate,
  deleteTemplate,
  type LabelTemplate,
} from "../lib/labelTemplate";
import { errorMessage } from "../lib/errorMessage";
import LabelDesigner from "./LabelDesigner";

const inp =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";

/** Шошгоны загвар — жагсаалт, шинээр үүсгэх, дизайнераар засах. */
export default function Labels() {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [editing, setEditing] = useState<LabelTemplate | null>(null);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Шинээр үүсгэх формын талбар
  const [name, setName] = useState("");
  const [w, setW] = useState(54);
  const [h, setH] = useState(34);
  const [dpi, setDpi] = useState(300);

  function reload() {
    listTemplates()
      .then(setTemplates)
      .catch((e) => setError(errorMessage(e)));
  }

  useEffect(() => {
    let active = true;
    listTemplates()
      .then((t) => active && setTemplates(t))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  async function handleCreate() {
    setError(null);
    try {
      const t = await createTemplate(name.trim() || "Шошго", w, h, dpi);
      setName("");
      reload();
      setEditing(t);
      setDirty(false);
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  async function handleSave() {
    if (!editing) return;
    setSaving(true);
    setError(null);
    try {
      await saveTemplate(editing);
      setDirty(false);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    setError(null);
    try {
      await deleteTemplate(id);
      if (editing?.id === id) setEditing(null);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  // ----- Дизайнер дэлгэц -----
  if (editing) {
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setEditing(null)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ← Жагсаалт
          </button>
          <input
            value={editing.name}
            onChange={(e) => {
              setEditing({ ...editing, name: e.target.value });
              setDirty(true);
            }}
            className={inp + " max-w-xs"}
          />
          <span className="text-sm text-slate-500">
            {editing.width_mm}×{editing.height_mm}мм · {editing.dpi} DPI
          </span>
          <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 px-2 py-1">
            <span className="text-xs text-slate-500" title="Цаасны байрлал тааруулга (хэвлэлтэд хэрэглэнэ)">
              Offset мм
            </span>
            <span className="text-xs text-slate-400">X</span>
            <input
              type="number"
              step={0.5}
              value={editing.offset_x_mm}
              onChange={(e) => {
                setEditing({ ...editing, offset_x_mm: Number(e.target.value) || 0 });
                setDirty(true);
              }}
              className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
            />
            <span className="text-xs text-slate-400">Y</span>
            <input
              type="number"
              step={0.5}
              value={editing.offset_y_mm}
              onChange={(e) => {
                setEditing({ ...editing, offset_y_mm: Number(e.target.value) || 0 });
                setDirty(true);
              }}
              className="w-16 rounded border border-slate-300 px-1.5 py-0.5 text-sm"
            />
          </div>
          <div className="flex-1" />
          {dirty && <span className="text-xs text-amber-600">Хадгалаагүй өөрчлөлт</span>}
          <button
            onClick={handleSave}
            disabled={saving || !dirty}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {saving ? "Хадгалж байна…" : "Хадгалах"}
          </button>
        </div>

        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        <LabelDesigner
          template={editing}
          onChange={(t) => {
            setEditing(t);
            setDirty(true);
          }}
        />
      </div>
    );
  }

  // ----- Жагсаалт + шинээр үүсгэх -----
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Шинээр үүсгэх */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Шинэ шошгоны загвар</h3>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[160px]">
            <label className="block text-xs font-medium text-slate-600">Нэр</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Хувцасны шошго" className={inp} />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-slate-600">Өргөн мм</label>
            <input type="number" value={w} onChange={(e) => setW(Number(e.target.value))} className={inp} />
          </div>
          <div className="w-20">
            <label className="block text-xs font-medium text-slate-600">Өндөр мм</label>
            <input type="number" value={h} onChange={(e) => setH(Number(e.target.value))} className={inp} />
          </div>
          <div className="w-24">
            <label className="block text-xs font-medium text-slate-600">DPI</label>
            <select value={dpi} onChange={(e) => setDpi(Number(e.target.value))} className={inp}>
              <option value={203}>203</option>
              <option value={300}>300</option>
            </select>
          </div>
          <button
            onClick={handleCreate}
            className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
          >
            Үүсгэх
          </button>
        </div>
      </div>

      {/* Жагсаалт */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Загварууд ({templates.length})
        </div>
        {templates.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-400">Загвар алга. Дээрээс үүсгэнэ үү.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {templates.map((t) => (
              <li key={t.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <button onClick={() => { setEditing(t); setDirty(false); }} className="text-left hover:text-indigo-700">
                  <span className="font-medium text-slate-800">{t.name}</span>
                  <span className="ml-2 text-xs text-slate-500">
                    {t.width_mm}×{t.height_mm}мм · {t.dpi} DPI · {t.objects.length} объект
                  </span>
                </button>
                <span className="flex items-center gap-3">
                  <button onClick={() => { setEditing(t); setDirty(false); }} className="text-xs text-indigo-600 hover:underline">
                    Засах
                  </button>
                  <button onClick={() => handleDelete(t.id)} className="text-xs text-red-600 hover:underline">
                    Устгах
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
