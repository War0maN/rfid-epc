import { useEffect, useState } from "react";
import { fetchAuditLog, type AuditRow } from "../lib/audit";

/** Үйлдлийн монгол шошго + өнгө. */
const ACTION_META: Record<string, { label: string; cls: string }> = {
  insert: { label: "Нэмсэн", cls: "bg-emerald-50 text-emerald-700" },
  update: { label: "Зассан", cls: "bg-amber-50 text-amber-700" },
  delete: { label: "Устгасан", cls: "bg-red-50 text-red-700" },
  generate: { label: "EPC үүсгэсэн", cls: "bg-indigo-50 text-indigo-700" },
  export_csv: { label: "CSV татсан", cls: "bg-slate-100 text-slate-700" },
  export_zpl: { label: "ZPL татсан", cls: "bg-slate-100 text-slate-700" },
};

const ENTITY_LABEL: Record<string, string> = {
  job: "Ажил",
  product: "Бараа",
  tenant: "Тохиргоо",
  epc: "EPC",
};

/** Логийн мөрөөс хүн уншихуйц товч тайлбар гаргана. */
function describe(row: AuditRow): string {
  const meta = row.meta ?? {};
  const after = row.after ?? {};
  const before = row.before ?? {};

  if (row.action === "generate") return `${meta.count ?? "?"} ширхэг EPC`;
  if (row.action === "export_csv" || row.action === "export_zpl")
    return `${meta.count ?? "?"} мөр`;

  const src = row.action === "delete" ? before : after;
  if (row.entity === "job") return src.job_number ? `№ ${src.job_number}` : "";
  if (row.entity === "product") return (src.name as string) || (src.gtin as string) || "";
  if (row.entity === "tenant") return (src.name as string) || "";
  return "";
}

/** Аудит лог: хэн/хэзээ/юу хийсэн түүх (зөвхөн өөрийн тенант). */
export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // "Сэргээх" товчинд (event handler — синхрон setState зүгээр).
  function load() {
    setLoading(true);
    setError(null);
    fetchAuditLog()
      .then(setRows)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }

  // Эхний ачаалал: effect дотор синхроноор setState дуудахгүйн тулд
  // (lint: set-state-in-effect) бүх төлвийг promise-callback дотор сольё.
  useEffect(() => {
    let active = true;
    fetchAuditLog()
      .then((d) => active && setRows(d))
      .catch((err) => active && setError(err instanceof Error ? err.message : String(err)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-slate-900">Аудит лог</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? "Ачаалж байна…" : "Сэргээх"}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <span className="mt-1 block text-xs text-red-500">
            (audit_log хүснэгт үүсээгүй бол docs/schema.sql-ийг Supabase дээр дахин ажиллуулна уу.)
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">Хэзээ</th>
              <th className="px-4 py-3">Үйлдэл</th>
              <th className="px-4 py-3">Обьект</th>
              <th className="px-4 py-3">Дэлгэрэнгүй</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-slate-400">
                  Лог хоосон байна.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const am = ACTION_META[r.action] ?? {
                  label: r.action,
                  cls: "bg-slate-100 text-slate-700",
                };
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="px-4 py-2">
                      <span className={"rounded px-2 py-0.5 text-xs font-medium " + am.cls}>
                        {am.label}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-slate-700">{ENTITY_LABEL[r.entity] ?? r.entity}</td>
                    <td className="px-4 py-2 text-slate-700">{describe(r)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
