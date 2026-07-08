import { errorMessage } from "../lib/errorMessage";
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";
import { fetchAuditLog, type AuditRow } from "../lib/audit";
import { labelOf } from "../lib/epcStatus";
import { TX_TYPE_LABEL, TX_STATUS_LABEL, type TxType, type TxStatus } from "../lib/transactions";

/** Үйлдлийн шошго (i18n) + өнгө. */
const ACTION_LABEL: Record<string, string> = labelMap({
  insert: "audit.action.insert",
  update: "audit.action.update",
  delete: "audit.action.delete",
  generate: "audit.action.generate",
  print: "audit.action.print",
  status_change: "audit.action.statusChange",
  export_csv: "audit.action.exportCsv",
  export_zpl: "audit.action.exportZpl",
});

const ACTION_CLS: Record<string, string> = {
  insert: "bg-emerald-50 text-emerald-700",
  update: "bg-amber-50 text-amber-700",
  delete: "bg-red-50 text-red-700",
  generate: "bg-indigo-50 text-indigo-700",
  print: "bg-emerald-50 text-emerald-700",
  status_change: "bg-sky-50 text-sky-700",
  export_csv: "bg-slate-100 text-slate-700",
  export_zpl: "bg-slate-100 text-slate-700",
};
const DEFAULT_CLS = "bg-slate-100 text-slate-700";

const ENTITY_LABEL: Record<string, string> = labelMap({
  job: "audit.entity.job",
  product: "audit.entity.product",
  tenant: "audit.entity.tenant",
  epc: "audit.entity.epc",
  category: "audit.entity.category",
  attribute: "audit.entity.attribute",
  branch: "audit.entity.branch",
  transaction: "audit.entity.transaction",
  inventory: "audit.entity.inventory",
  inventory_epcs: "audit.entity.inventoryEpcs",
});

/** Талбарын түлхүүр → нэр (дэлгэрэнгүй модалд). Танихгүйг түлхүүрээр нь. */
const FIELD_LABEL: Record<string, string> = labelMap({
  name: "audit.field.name",
  code: "audit.field.code",
  sku: "audit.field.sku",
  gtin: "audit.field.gtin",
  price: "audit.field.price",
  status: "audit.field.status",
  note: "audit.field.note",
  sort: "audit.field.sort",
  label: "audit.field.label",
  input_type: "audit.field.inputType",
  required: "audit.field.required",
  options: "audit.field.options",
  attributes: "audit.field.attributes",
  category_id: "audit.field.categoryId",
  parent_id: "audit.field.parentId",
  branch_id: "audit.field.branchId",
  from_branch: "audit.field.fromBranch",
  to_branch: "audit.field.toBranch",
  type: "audit.field.type",
  job_number: "audit.field.jobNumber",
  arrival_date: "audit.field.arrivalDate",
  supplier: "audit.field.supplier",
  box_no: "audit.field.boxNo",
  serial: "audit.field.serial",
  epc_hex: "audit.field.epcHex",
  printed_at: "audit.field.printedAt",
  completed_at: "audit.field.completedAt",
  created_at: "audit.field.createdAt",
  created_by: "audit.field.createdBy",
  email: "audit.field.email",
  role: "audit.field.role",
  count: "audit.field.count",
  report: "audit.field.report",
  from: "audit.field.from",
  to: "audit.field.to",
  group: "audit.field.group",
});
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
        [i18n.t("audit.entity.product"), src.name],
        [i18n.t("audit.field.sku"), src.sku],
        [i18n.t("audit.field.gtin"), src.gtin],
        [i18n.t("audit.field.price"), src.price],
      ]);
    case "branch":
      return pick([
        [i18n.t("audit.entity.branch"), src.name],
        [i18n.t("audit.field.code"), src.code],
      ]);
    case "category":
      return pick([[i18n.t("audit.entity.category"), src.name]]);
    case "attribute":
      return pick([[i18n.t("audit.entity.attribute"), src.label]]);
    case "job":
      return pick([
        [i18n.t("audit.field.jobNumber"), src.job_number],
        [i18n.t("audit.field.arrivalDate"), src.arrival_date],
        [i18n.t("audit.field.supplier"), src.supplier],
      ]);
    case "transaction":
      return pick([
        [i18n.t("audit.subjectType"), TX_TYPE_LABEL[src.type as TxType] ?? src.type],
        [i18n.t("audit.subjectTxStatus"), TX_STATUS_LABEL[src.status as TxStatus] ?? src.status],
        [i18n.t("audit.field.note"), src.note],
      ]);
    case "tenant":
      return pick([[i18n.t("audit.field.name"), src.name]]);
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
    return `${meta.job_number ? `№ ${meta.job_number} — ` : ""}${i18n.t("audit.epcCount", {
      n: meta.count ?? "?",
    })}`;
  if (row.action === "export_csv" || row.action === "export_zpl")
    return i18n.t("audit.rowCount", { n: meta.count ?? "?" });

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
  const { t } = useTranslation();
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
        <h2 className="text-lg font-semibold text-slate-900">{t("audit.title")}</h2>
        <button
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {loading ? t("common.loading") : t("audit.refresh")}
        </button>
      </div>

      {error && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <span className="mt-1 block text-xs text-red-500">
            {t("audit.schemaHint")}
          </span>
        </p>
      )}

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-4 py-3">{t("audit.colWhen")}</th>
              <th className="px-4 py-3">{t("audit.colWho")}</th>
              <th className="px-4 py-3">{t("audit.colAction")}</th>
              <th className="px-4 py-3">{t("audit.colEntity")}</th>
              <th className="px-4 py-3">{t("audit.colDetail")}</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.length === 0 && !loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                  {t("audit.emptyLog")}
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const am = {
                  label: ACTION_LABEL[r.action] ?? r.action,
                  cls: ACTION_CLS[r.action] ?? DEFAULT_CLS,
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
                      (ACTION_CLS[detail.action] ?? DEFAULT_CLS)
                    }
                  >
                    {ACTION_LABEL[detail.action] ?? detail.action}
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
                          {t("audit.byProduct")}
                        </p>
                        <div className="rounded-lg border border-slate-200">
                          {Object.entries(byProduct).map(([name, cnt]) => (
                            <div
                              key={name}
                              className="flex justify-between border-b border-slate-100 px-3 py-1.5 text-sm last:border-b-0"
                            >
                              <span className="text-slate-700">{name}</span>
                              <span className="font-medium tabular-nums text-slate-900">
                                {t("audit.pcs", { n: Number(cnt).toLocaleString() })}
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
                          {t("audit.epcList")}{" "}
                          {meta.epcsTruncated
                            ? t("audit.epcListTruncated", {
                                shown: epcs.length,
                                total: fmtVal(meta.count),
                              })
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
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t("audit.diffField")}</th>
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t("audit.diffBefore")}</th>
                            <th className="border-b border-slate-200 bg-slate-50 px-3 py-1.5 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">{t("audit.diffAfter")}</th>
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
                      <p className="py-6 text-center text-sm text-slate-400">{t("audit.noDetails")}</p>
                    )}
                  </>
                );
              })()}

              {/* Түүхий JSON (техник шалгалтад) */}
              <button
                onClick={() => setShowRaw((s) => !s)}
                className="text-xs text-slate-400 hover:text-slate-600 hover:underline"
              >
                {showRaw ? t("audit.hideRawJson") : t("audit.showRawJson")}
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
