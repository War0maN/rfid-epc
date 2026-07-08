import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { labelMap } from "../i18n/labelMap";
import {
  listCategories,
  listAttributeDefs,
  createCategory,
  renameCategory,
  deleteCategory,
  createAttributeDef,
  updateAttributeDef,
  deleteAttributeDef,
  buildTree,
  dedupAttrs,
  CATEGORY_LEVELS,
  MAX_CATEGORY_DEPTH,
  type Category,
  type CategoryNode,
  type AttributeDef,
  type AttrInputType,
} from "../lib/catalog";
import { errorMessage } from "../lib/errorMessage";

const inp =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const btn = "rounded-lg border border-slate-300 px-2.5 py-1 text-sm text-slate-700 hover:bg-slate-50";
const primaryBtn =
  "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

const TYPE_LABEL: Record<AttrInputType, string> = labelMap({
  text: "catalog.typeText",
  number: "catalog.typeNumber",
  select: "catalog.typeSelect",
});

/** Динамик каталог: ангиллын мод + шинж чанарын тодорхойлолт (Тохиргоо). */
/** canEdit=false бол зөвхөн харах горим (эрхийн систем — DB давхар хамгаална). */
export default function Catalog({ canEdit = true }: { canEdit?: boolean }) {
  const { t } = useTranslation();
  const [cats, setCats] = useState<Category[]>([]);
  const [attrs, setAttrs] = useState<AttributeDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Ангилал нэмэх/нэр солих төлөв
  const [addParent, setAddParent] = useState<string | null | false>(false); // false=нэмэхгүй
  const [addLevel, setAddLevel] = useState(""); // нэмэх түвшний нэр (placeholder)
  const [addName, setAddName] = useState("");
  const [renameId, setRenameId] = useState<string | null>(null);
  const [renameName, setRenameName] = useState("");

  function reload() {
    setLoading(true);
    Promise.all([listCategories(), listAttributeDefs()])
      .then(([c, a]) => {
        setCats(c);
        setAttrs(a);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    Promise.all([listCategories(), listAttributeDefs()])
      .then(([c, a]) => {
        if (!active) return;
        setCats(c);
        setAttrs(a);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const tree = useMemo(() => buildTree(cats), [cats]);
  // Шинж чанар нэг л глобал жагсаалт (давхардлыг арилгасан).
  const globalAttrs = useMemo(() => dedupAttrs(attrs), [attrs]);

  // ----- Ангилал үйлдлүүд -----
  function startAdd(parentId: string | null, levelName: string) {
    setAddParent(parentId);
    setAddLevel(levelName);
    setAddName("");
  }
  function saveAdd() {
    if (addParent === false) return;
    const name = addName.trim();
    if (!name) return;
    createCategory(name, addParent)
      .then(() => {
        setAddParent(false);
        setAddName("");
        reload();
      })
      .catch((e) => setError(errorMessage(e)));
  }
  function saveRename() {
    if (!renameId) return;
    renameCategory(renameId, renameName)
      .then(() => {
        setRenameId(null);
        reload();
      })
      .catch((e) => setError(errorMessage(e)));
  }
  function removeCategory(c: CategoryNode) {
    const msg = c.children.length
      ? t("catalog.confirmDeleteCategoryWithChildren", { name: c.name })
      : t("catalog.confirmDeleteCategory", { name: c.name });
    if (!window.confirm(msg)) return;
    deleteCategory(c.id)
      .then(reload)
      .catch((e) => setError(errorMessage(e)));
  }

  function renderNode(node: CategoryNode, depth: number): React.ReactNode {
    const canAddChild = depth < MAX_CATEGORY_DEPTH - 1; // 3 түвшнээс хэтрэхгүй
    return (
      <div key={node.id}>
        <div
          className="group flex items-center gap-1 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
          style={{ paddingLeft: depth * 16 + 8 }}
        >
          {renameId === node.id ? (
            <>
              <input
                autoFocus
                value={renameName}
                onChange={(e) => setRenameName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveRename()}
                className={inp + " h-7 max-w-[160px]"}
              />
              <button onClick={saveRename} className="text-xs text-indigo-600">✓</button>
              <button onClick={() => setRenameId(null)} className="text-xs text-slate-400">✕</button>
            </>
          ) : (
            <>
              <span className="flex-1 font-medium">
                {node.name}
                <span className="ml-1.5 text-[10px] font-normal text-slate-400">
                  {CATEGORY_LEVELS[depth] ?? ""}
                </span>
              </span>
              <div className={canEdit ? "hidden gap-1 group-hover:flex" : "hidden"}>
                {canAddChild && (
                  <button
                    onClick={() => startAdd(node.id, CATEGORY_LEVELS[depth + 1])}
                    className="text-xs text-slate-400 hover:text-indigo-600"
                    title={t("catalog.addLevelTitle", { level: CATEGORY_LEVELS[depth + 1] })}
                  >
                    ＋
                  </button>
                )}
                <button
                  onClick={() => {
                    setRenameId(node.id);
                    setRenameName(node.name);
                  }}
                  className="text-xs text-slate-400 hover:text-indigo-600"
                  title={t("catalog.renameTitle")}
                >
                  ✎
                </button>
                <button onClick={() => removeCategory(node)} className="text-xs text-slate-400 hover:text-red-600" title={t("common.delete")}>🗑</button>
              </div>
            </>
          )}
        </div>
        {addParent === node.id && (
          <div className="flex items-center gap-1 py-1" style={{ paddingLeft: (depth + 1) * 16 + 8 }}>
            <input
              autoFocus
              value={addName}
              onChange={(e) => setAddName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && saveAdd()}
              placeholder={t("catalog.levelNamePlaceholder", { level: addLevel })}
              className={inp + " h-7 max-w-[160px]"}
            />
            <button onClick={saveAdd} className="text-xs text-indigo-600">✓</button>
            <button onClick={() => setAddParent(false)} className="text-xs text-slate-400">✕</button>
          </div>
        )}
        {node.children.map((ch) => renderNode(ch, depth + 1))}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t("catalog.title")}</h2>
        <p className="text-sm text-slate-500">
          {t("catalog.intro", { levels: CATEGORY_LEVELS.join(" → ") })}
        </p>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Зүүн: ангиллын мод */}
        <div className="w-full shrink-0 rounded-xl border border-slate-200 bg-white p-3 lg:w-80">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-semibold text-slate-700">{t("common.category")}</span>
            {canEdit && (
              <button onClick={() => startAdd(null, CATEGORY_LEVELS[0])} className={btn}>
                + {CATEGORY_LEVELS[0]}
              </button>
            )}
          </div>

          {addParent === null && (
            <div className="mb-2 flex items-center gap-1">
              <input
                autoFocus
                value={addName}
                onChange={(e) => setAddName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && saveAdd()}
                placeholder={t("catalog.levelNamePlaceholder", { level: addLevel })}
                className={inp + " h-7"}
              />
              <button onClick={saveAdd} className="text-xs text-indigo-600">✓</button>
              <button onClick={() => setAddParent(false)} className="text-xs text-slate-400">✕</button>
            </div>
          )}

          {loading ? (
            <p className="px-2 py-4 text-sm text-slate-400">{t("common.loading")}</p>
          ) : tree.length === 0 ? (
            <p className="px-2 py-4 text-sm text-slate-400">{t("catalog.noCategories", { level: CATEGORY_LEVELS[0] })}</p>
          ) : (
            <div>{tree.map((n) => renderNode(n, 0))}</div>
          )}
        </div>

        {/* Баруун: шинж чанарууд (нэг глобал жагсаалт) */}
        <div className="flex-1 rounded-xl border border-slate-200 bg-white p-4">
          <div className="mb-3">
            <span className="text-sm font-semibold text-slate-700">{t("catalog.attrsGlobalTitle")}</span>
            <p className="mt-1 text-xs text-slate-400">
              {t("catalog.attrsGlobalDesc")}
            </p>
          </div>

          <AttrList
            attrs={globalAttrs}
            categoryId={null}
            canEdit={canEdit}
            onChanged={reload}
            onError={(m) => setError(m)}
          />
        </div>
      </div>
    </div>
  );
}

// ---------- Шинж чанарын жагсаалт + нэмэх/засах ----------

function AttrList({
  attrs,
  categoryId,
  canEdit = true,
  onChanged,
  onError,
}: {
  attrs: AttributeDef[];
  categoryId: string | null;
  canEdit?: boolean;
  onChanged: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState<AttributeDef | "new" | null>(null);

  function remove(a: AttributeDef) {
    if (!window.confirm(t("catalog.confirmDeleteAttr", { label: a.label }))) return;
    deleteAttributeDef(a.id)
      .then(onChanged)
      .catch((e) => onError(errorMessage(e)));
  }

  return (
    <div className="space-y-2">
      {attrs.length === 0 && editing !== "new" && (
        <p className="rounded-lg border border-dashed border-slate-200 px-3 py-4 text-center text-sm text-slate-400">
          {t("catalog.noAttrs")}
        </p>
      )}

      {attrs.map((a) =>
        editing && editing !== "new" && editing.id === a.id ? (
          <AttrForm
            key={a.id}
            categoryId={categoryId}
            initial={a}
            onDone={() => {
              setEditing(null);
              onChanged();
            }}
            onCancel={() => setEditing(null)}
            onError={onError}
          />
        ) : (
          <div key={a.id} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm">
            <span className="font-medium text-slate-800">{a.label}</span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-xs text-slate-500">{TYPE_LABEL[a.input_type]}</span>
            {a.required && <span className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">{t("catalog.requiredBadge")}</span>}
            {a.input_type === "select" && a.options.length > 0 && (
              <span className="truncate text-xs text-slate-400">{a.options.join(", ")}</span>
            )}
            {canEdit && (
              <div className="ml-auto flex gap-2">
                <button onClick={() => setEditing(a)} className="text-xs text-indigo-600 hover:underline">{t("common.edit")}</button>
                <button onClick={() => remove(a)} className="text-xs text-red-600 hover:underline">{t("common.delete")}</button>
              </div>
            )}
          </div>
        )
      )}

      {editing === "new" ? (
        <AttrForm
          categoryId={categoryId}
          onDone={() => {
            setEditing(null);
            onChanged();
          }}
          onCancel={() => setEditing(null)}
          onError={onError}
        />
      ) : canEdit ? (
        <button onClick={() => setEditing("new")} className={btn + " mt-1"}>
          {t("catalog.addAttr")}
        </button>
      ) : null}
    </div>
  );
}

function AttrForm({
  categoryId,
  initial,
  onDone,
  onCancel,
  onError,
}: {
  categoryId: string | null;
  initial?: AttributeDef;
  onDone: () => void;
  onCancel: () => void;
  onError: (m: string) => void;
}) {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initial?.label ?? "");
  const [type, setType] = useState<AttrInputType>(initial?.input_type ?? "text");
  const [optionsText, setOptionsText] = useState((initial?.options ?? []).join(", "));
  const [required, setRequired] = useState(initial?.required ?? false);
  const [busy, setBusy] = useState(false);

  function save() {
    const lbl = label.trim();
    if (!lbl) return;
    const options =
      type === "select"
        ? optionsText.split(",").map((s) => s.trim()).filter(Boolean)
        : [];
    if (type === "select" && options.length === 0) {
      onError(t("catalog.selectNeedsOption"));
      return;
    }
    setBusy(true);
    const input = { category_id: categoryId, label: lbl, input_type: type, options, required };
    const p = initial
      ? updateAttributeDef(initial.id, input)
      : createAttributeDef(input).then(() => undefined);
    p.then(onDone)
      .catch((e) => onError(errorMessage(e)))
      .finally(() => setBusy(false));
  }

  return (
    <div className="space-y-2 rounded-lg border border-indigo-200 bg-indigo-50/40 p-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div>
          <label className="mb-0.5 block text-xs text-slate-500">{t("common.name")}</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} placeholder={t("catalog.attrNamePlaceholder")} className={inp} />
        </div>
        <div>
          <label className="mb-0.5 block text-xs text-slate-500">{t("catalog.typeLabel")}</label>
          <select value={type} onChange={(e) => setType(e.target.value as AttrInputType)} className={inp}>
            <option value="text">{t("catalog.typeText")}</option>
            <option value="number">{t("catalog.typeNumber")}</option>
            <option value="select">{t("catalog.typeSelectDropdown")}</option>
          </select>
        </div>
      </div>

      {type === "select" && (
        <div>
          <label className="mb-0.5 block text-xs text-slate-500">{t("catalog.optionsLabel")}</label>
          <input
            value={optionsText}
            onChange={(e) => setOptionsText(e.target.value)}
            placeholder={t("catalog.optionsPlaceholder")}
            className={inp}
          />
        </div>
      )}

      <label className="flex items-center gap-2 text-sm text-slate-600">
        <input type="checkbox" checked={required} onChange={(e) => setRequired(e.target.checked)} />
        {t("catalog.requiredLabel")}
      </label>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className={btn}>{t("catalog.cancel")}</button>
        <button onClick={save} disabled={busy || !label.trim()} className={primaryBtn}>
          {busy ? t("catalog.saving") : t("common.save")}
        </button>
      </div>
    </div>
  );
}
