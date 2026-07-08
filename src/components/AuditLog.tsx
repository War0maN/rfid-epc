import { errorMessage } from "../lib/errorMessage";
import { useEffect, useState } from "react";
import { fetchAuditLog, type AuditRow } from "../lib/audit";
import { labelOf } from "../lib/epcStatus";
import { TX_TYPE_LABEL, TX_STATUS_LABEL, type TxType, type TxStatus } from "../lib/transactions";

/** Үйлдлийн монгол шошго + өнгө. */
const ACTION_META: Record<string, { label: string; cls: string }> = {
  insert: { label: "Нэмсэн", cls: "bg-emerald-50 text-emerald-700" },
  update: { label: "Зассан", cls: "bg-amber-50 text-amber-700" },
  delete: { label: "Устгасан", cls: "bg-red-50 text-red-700" },
  generate: { label: "EPC үүсгэсэн", cls: "bg-indigo-50 text-indigo-700" },
  print: { label: "Хэвлэсэн", cls: "bg-emerald-50 text-emerald-700" },
  status_change: { label: "Төлөв өөрчилсөн", cls: "bg-sky-50 text-sky-700" },
  export_csv: { label: "CSV татсан", cls: "bg-slate-100 text-slate-700" },
  export_zpl: { label: "ZPL татсан", cls: "bg-slate-100 text-slate-700" },
};

const ENTITY_LABEL: Record<string, string> = {
  job: "Ажил",
  product: "Бараа",
  tenant: "Тохиргоо",
  epc: "EPC",
  category: "Ангилал",
  attribute: "Шинж чанар",
  branch: "Салбар",
  transaction: "Гүйлгээ",
  inventory: "Үлдэгдэл",
  inventory_epcs: "Үлдэгдэл (EPC)",
};

/** Талбарын түлхүүр → Монгол нэр (дэлгэрэнгүй модалд). Танихгүйг түлхүүрээр нь. */
const FIELD_LABEL: Record<string, string> = {
  name: "Нэр",
  code: "Код",
  sku: "SKU",
  gtin: "GTIN/баркод",
  price: "Үнэ",
  status: "Төлөв",
  note: "Тэмдэглэл",
  sort: "Эрэмбэ",
  label: "Шошго/нэр",
  input_type: "Төрөл",
  required: "Заавал эсэх",
  options: "Сонголтууд",
  attributes: "Шинж чанарууд",
  category_id: "Ангилал",
  parent_id: "Эцэг ангилал",
  branch_id: "Салбар",
  from_branch: "Эх салбар",
  to_branch: "Очих салбар",
  type: "Гүйлгээний төрөл",
  job_number: "Ажлын №",
  arrival_date: "Ирсэн огноо",
  supplier: "Нийлүүлэгч",
  box_no: "Хайрцаг",
  serial: "Serial",
  epc_hex: "EPC",
  printed_at: "Хэвлэсэн огноо",
  completed_at: "Дууссан огноо",
  created_at: "Үүссэн огноо",
  created_by: "Үүсгэсэн хэрэглэгч",
  email: "Имэйл",
  role: "Эрх",
  count: "Тоо ширхэг",
  report: "Тайлан",
  from: "Эхлэх",
  to: "Дуусах",
  group: "Бүлэглэлт",
};
const fieldLabel = (k: string) => FIELD_LABEL[k] ?? k;

// Дэлгэрэнгүйд нуух техник талбарууд (мэдээллийн үнэ цэнэгүй).
const HIDDEN_FIELDS = new Set(["id", "tenant_id"]);

/** Утгыг хүн уншихуйц болгоно (объект → JSON, null → —). */
function fmtVal(v: unknown): string {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

interface DiffRow {
  key: string;
  before: string;
  after: string;
}

/** update-д зөвхөн өөрчлөгдсөн талбарууд; insert/delete-д бүх талбар. */
function diffRows(row: AuditRow): DiffRow[] {
  const before = row.before ?? {};
  const after = row.after ?? {};
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].filter(
    (k) => !HIDDEN_FIELDS.has(k)
  );
  const out: DiffRow[] = [];
  for (const k of keys) {
    const b = before[k];
    const a = after[k];
    if (row.action === "update" && JSON.stringify(b) === JSON.stringify(a)) continue;
    out.push({ key: k, before: fmtVal(b), after: fmtVal(a) });
  }
  return out;
}

/**
 * "Яг юунд" үйлдэл хийснийг таних мөрүүд — обьектын төрлөөс хамаарч
 * гол талбаруудыг (бараа нэр/SKU, салбар нэр, ажлын дугаар...) гаргана.
 */
function subjectRows(row: AuditRow): { label: string; value: string }[] {
  const src = ((row.action === "delete" ? row.before : row.after) ?? row.before ?? {}) as Record<
    string,
    unknown
  >;
  const pick = (pairs: [string, unknown][]) =>
    pairs
      .filter(([, v]) => v != null && v !== "")
      .map(([label, v]) => ({ label, value: fmtVal(v) }));
  switch (row.entity) {
    case "product":
      return pick([
        ["Бараа", src.name],
        ["SKU", src.sku],
        ["GTIN/баркод", src.gtin],
        ["Үнэ", src.price],
      ]);
    case "branch":
      return pick([
        ["Салбар", src.name],
        ["Код", src.code],
      ]);
    case "category":
      return pick([["Ангилал", src.name]]);
    case "attribute":
      return pick([["Шинж чанар", src.label]]);
    case "job":
      return pick([
        ["Ажлын №", src.job_number],
        ["Ирсэн огноо", src.arrival_date],
        ["Нийлүүлэгч", src.supplier],
      ]);
    case "transaction":
      return pick([
        ["Төрөл", TX_TYPE_LABEL[src.type as TxType] ?? src.type],
        ["Гүйлгээний төлөв", TX_STATUS_LABEL[src.status as TxStatus] ?? src.status],
        ["Тэмдэглэл", src.note],
      ]);
    case "tenant":
      return pick([["Нэр", src.name]]);
    default:
      return [];
  }
}

/** Логийн мөрөөс хүн уншихуйц товч тайлбар гаргана. */
function describe(row: AuditRow): string {
  const meta = row.meta ?? {};
  const after = row.after ?? {};
  const before = row.before ?? {};

  if (row.action === "generate")
    return `${meta.job_number ? `№ ${meta.job_number} — ` : ""}${meta.count ?? "?"} ширхэг EPC`;
  if (row.action === "export_csv" || row.action === "export_zpl")
    return `${meta.count ?? "?"} мөр`;

  const src = row.action === "delete" ? before : after;
  if (row.entity === "job") return src.job_number ? `№ ${src.job_number}` : "";
  if (row.entity === "product") return (src.name as string) || (src.gtin as string) || "";
  if (row.entity === "tenant") return (src.name as string) || "";
  if (row.entity === "category") return (src.name as string) || "";
  if (row.entity === "attribute") return (src.label as string) || "";
  if (row.entity === "branch") return (src.name as string) || "";
  return "";
}

/** Аудит лог: хэн/хэзээ/юу хийсэн түүх (зөвхөн өөрийн тенант). */
export default function AuditLog() {
  const [rows, setRows] = useState<AuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Дэлгэрэнгүй модал: сонгосон лог + түүхий JSON харах toggle.
  const [detail, setDetail] = useState<AuditRow | null>(null);
  const [showRaw, setShowRaw] = useState(false);

  function openDetail(r: AuditRow) {
    setShowRaw(false);
    setDetail(r);
  }

  // "Сэргээх" товчинд (event handler — синхрон setState зүгээр).
  function load() {
    setLoading(true);
    setError(null);
    fetchAuditLog()
      .then(setRows)
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }

  // Эхний ачаалал: effect дотор синхроноор setState дуудахгүйн тулд
  // (lint: set-state-in-effect) бүх төлвийг promise-callback дотор сольё.
  useEffect(() => {
    let active = true;
    fetchAuditLog()
      .then((d) => active && setRows(d))
      .catch((err) => active && setError(errorMessage(err)))
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
              <th className="px-4 py-3">Хэн</th>
              <th className="px-4 py-3">Үйлдэл</th>
              <th className="px-4 py-3">Обьект</th>
              <th className="px-4 py-3">Дэлгэрэнгүй</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
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
                  <tr key={r.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(r)}>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-500">
                      {new Date(r.created_at).toLocaleString()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-2 text-slate-600">
                      {r.actor_email ?? <span className="text-slate-300">—</span>}
                    </td>
                    <td className="px-4 py-2">
                      <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + am.cls}>
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

      {/* Дэлгэрэнгүй модал */}
      {detail && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDetail(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="flex flex-wrap items-center gap-2 font-semibold text-slate-900">
                  <span
                    className={
                      "whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " +
                      (ACTION_META[detail.action]?.cls ?? "bg-slate-100 text-slate-700")
                    }
                  >
                    {ACTION_META[detail.action]?.label ?? detail.action}
                  </span>
                  {ENTITY_LABEL[detail.entity] ?? detail.entity}
                  {describe(detail) && <span className="font-normal text-slate-500">· {describe(detail)}</span>}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  {new Date(detail.created_at).toLocaleString()}
                  {detail.actor_email && <> · {detail.actor_email}</>}
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>
            <div className="max-h-[65vh] overflow-auto px-4 py-3">
              {(() => {
                const subject = subjectRows(detail);
                const meta = (detail.meta ?? {}) as Record<string, unknown>;
                const byProduct = (meta.byProduct ?? null) as Record<string, number> | null;
                const epcs = (meta.epcs ?? null) as string[] | null;
                const metaRest = Object.entries(meta).filter(
                  ([k]) => !["byProduct", "epcs", "epcsTruncated"].includes(k)
                );
                const diffs = detail.action === "update" ? diffRows(detail) : [];
                const empty =
                  subject.length === 0 &&
                  !byProduct &&
                  (!epcs || epcs.length === 0) &&
                  metaRest.length === 0 &&
                  diffs.length === 0;
                return (
                  <>
                    {/* Яг юунд үйлдэл хийсэн бэ */}
                    {subject.length > 0 && (
                      <div className="mb-3 rounded-lg border border-slate-200 px-3 py-2">
                        {subject.map((s) => (
                          <p key={s.label} className="text-sm text-slate-700">
                            <span className="text-slate-500">{s.label}:</span>{" "}
                            <span className="font-medium">{s.value}</span>
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Meta (тоо, шинэ төлөв, тэмдэглэл г.м.) */}
                    {metaRest.length > 0 && (
                      <div className="mb-3 rounded-lg bg-slate-50 px-3 py-2">
                        {metaRest.map(([k, v]) => (
                          <p key={k} className="text-xs text-slate-600">
                            <span className="font-medium">{fieldLabel(k)}:</span>{" "}
                            {k === "status" ? labelOf(String(v)) : fmtVal(v)}
                          </p>
                        ))}
                      </div>
                    )}

                    {/* Бөөн EPC үйлдэл: бараагаар задаргаа */}
                    {byProduct && Object.keys(byProduct).length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Бараагаар
                        </p>
                        <div className="rounded-lg border border-slate-200">
                          {Object.entries(byProduct).map(([name, cnt]) => (
                            <div
                              key={name}
                              className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0"
                            >
                              <span className="text-slate-700">{name}</span>
                              <span className="font-medium tabular-nums text-slate-900">
                                {Number(cnt).toLocaleString()}ш
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Бөөн EPC үйлдэл: хамрагдсан EPC кодууд */}
                    {epcs && epcs.length > 0 && (
                      <div className="mb-3">
                        <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                          EPC жагсаалт{" "}
                          {meta.epcsTruncated
                            ? `(эхний ${epcs.length} — нийт ${fmtVal(meta.count)})`
                            : `(${epcs.length})`}
                        </p>
                        <div className="max-h-40 overflow-auto rounded-lg bg-slate-50 px-3 py-2 font-mono text-[11px] leading-relaxed text-slate-600">
                          {epcs.map((h) => (
                            <div key={h}>{h}</div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Засварын өөрчлөлт (зөвхөн update-д) */}
                    {diffs.length > 0 && (
                      <table className="mb-3 min-w-full text-sm">
                        <thead>
                          <tr>
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Талбар</th>
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Өмнө</th>
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">Дараа</th>
                          </tr>
                        </thead>
                        <tbody>
                          {diffs.map((d) => (
                            <tr key={d.key}>
                              <td className="border-b border-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600">{fieldLabel(d.key)}</td>
                              <td className="break-all border-b border-slate-100 px-3 py-1.5 text-xs text-red-700">{d.before}</td>
                              <td className="break-all border-b border-slate-100 px-3 py-1.5 text-xs text-emerald-700">{d.after}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}

                    {empty && (
                      <p className="py-6 text-center text-sm text-slate-400">Дэлгэрэнгүй мэдээлэл алга.</p>
                    )}
                  </>
                );
              })()}

              {/* Түүхий JSON (техник шалгалтад) */}
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                {showRaw ? "▾ Түүхий JSON нуух" : "▸ Түүхий JSON харах"}
              </button>
              {showRaw && (
                <pre className="mt-2 max-h-60 overflow-auto rounded-lg bg-slate-900 p-3 text-[11px] leading-relaxed text-slate-100">
                  {JSON.stringify(
                    { before: detail.before, after: detail.after, meta: detail.meta },
                    null,
                    2
                  )}
                </pre>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
