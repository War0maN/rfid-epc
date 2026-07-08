import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  listBranches,
  createBranch,
  updateBranch,
  deleteBranch,
  type Branch,
} from "../lib/branches";
import { errorMessage } from "../lib/errorMessage";

const inp =
  "w-full rounded border border-slate-300 px-2 py-1 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";

interface Props {
  isAdmin: boolean;
}

/** Салбар (branch/location) удирдах — нэр + код. EPC ширхэг бүр салбарт байна. */
export default function Branches({ isAdmin }: Props) {
  const { t } = useTranslation();
  const [rows, setRows] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [adding, setAdding] = useState(false);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editCode, setEditCode] = useState("");

  function reload() {
    setLoading(true);
    listBranches()
      .then((d) => {
        setRows(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    listBranches()
      .then((d) => active && setRows(d))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function saveAdd() {
    if (!name.trim()) return;
    createBranch(name, code || null)
      .then(() => {
        setAdding(false);
        setName("");
        setCode("");
        reload();
      })
      .catch((e) => setError(errorMessage(e)));
  }
  function saveEdit() {
    if (!editId) return;
    updateBranch(editId, editName, editCode || null)
      .then(() => {
        setEditId(null);
        reload();
      })
      .catch((e) => setError(errorMessage(e)));
  }
  function remove(b: Branch) {
    if (!window.confirm(t("branches.confirmDelete", { name: b.name }))) return;
    deleteBranch(b.id)
      .then(reload)
      .catch((e) => setError(errorMessage(e)));
  }

  const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-3 py-2 text-slate-700";

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("branches.title")}</h2>
          <p className="text-sm text-slate-500">
            {t("branches.subtitle")}
          </p>
        </div>
        {isAdmin && !adding && (
          <button onClick={() => setAdding(true)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            {t("branches.addBranch")}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t("common.name")}</th>
              <th className={th}>{t("common.code")}</th>
              {isAdmin && <th className={th + " text-right"}>{t("common.actions")}</th>}
            </tr>
          </thead>
          <tbody>
            {adding && (
              <tr>
                <td className={td}><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveAdd()} placeholder={t("branches.namePlaceholder")} className={inp} /></td>
                <td className={td}><input value={code} onChange={(e) => setCode(e.target.value)} placeholder={t("branches.codePlaceholder")} className={inp} /></td>
                <td className={td + " text-right"}>
                  <button onClick={saveAdd} className="text-xs text-indigo-600 hover:underline">{t("common.save")}</button>
                  <button onClick={() => setAdding(false)} className="ml-2 text-xs text-slate-400 hover:underline">{t("branches.cancel")}</button>
                </td>
              </tr>
            )}
            {loading ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : rows.length === 0 && !adding ? (
              <tr><td colSpan={3} className="px-4 py-8 text-center text-slate-400">{t("branches.empty")}</td></tr>
            ) : (
              rows.map((b) =>
                editId === b.id ? (
                  <tr key={b.id}>
                    <td className={td}><input autoFocus value={editName} onChange={(e) => setEditName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && saveEdit()} className={inp} /></td>
                    <td className={td}><input value={editCode} onChange={(e) => setEditCode(e.target.value)} className={inp} /></td>
                    <td className={td + " text-right"}>
                      <button onClick={saveEdit} className="text-xs text-indigo-600 hover:underline">{t("common.save")}</button>
                      <button onClick={() => setEditId(null)} className="ml-2 text-xs text-slate-400 hover:underline">{t("branches.cancel")}</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={b.id} className="hover:bg-slate-50">
                    <td className={td + " font-medium text-slate-800"}>{b.name}</td>
                    <td className={td + " font-mono text-xs text-slate-500"}>{b.code || "—"}</td>
                    {isAdmin && (
                      <td className={td + " text-right"}>
                        <button onClick={() => { setEditId(b.id); setEditName(b.name); setEditCode(b.code ?? ""); }} className="text-xs text-slate-500 hover:underline">{t("common.edit")}</button>
                        <button onClick={() => remove(b)} className="ml-2 text-xs text-red-600 hover:underline">{t("common.delete")}</button>
                      </td>
                    )}
                  </tr>
                )
              )
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
