import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import {
  fetchTxReport,
  groupTx,
  WO_GROUP_LABEL,
  noBranchLabel,
  noNoteLabel,
  unknownUserLabel,
  type TxReportRow,
  type WriteoffGroup,
} from "../lib/txReports";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/**
 * Актлалтын тайлан — "Бусад гүйлгээ" (ADJ) болгож нөөцөөс хассан бараа:
 * хэн, ямар шалтгаанаар (тэмдэглэл), ямар дүнтэй. Хяналт/аудитын гол тайлан.
 * Дүн = гүйлгээний үеийн snapshot үнэ.
 */
export default function WriteoffReport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<WriteoffGroup>("note");

  const [rows, setRows] = useState<TxReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const req = useRef(0);
  function load(f: string, t: string) {
    if (!f || !t) return;
    setLoading(true);
    const r = ++req.current;
    fetchTxReport("other", f, t)
      .then((res) => {
        if (req.current !== r) return;
        setRows(res);
        setError(null);
      })
      .catch((e) => req.current === r && setError(errorMessage(e)))
      .finally(() => req.current === r && setLoading(false));
  }

  useEffect(() => {
    let active = true;
    const r = ++req.current;
    fetchTxReport("other", from, to)
      .then((res) => active && req.current === r && setRows(res))
      .catch((e) => active && req.current === r && setError(errorMessage(e)))
      .finally(() => active && req.current === r && setLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRange(f: string, t: string) {
    setFrom(f);
    setTo(t);
    load(f, t);
  }
  function presetDays(n: number) {
    setRange(daysAgo(n), isoDay(new Date()));
  }
  function presetThisMonth() {
    const now = new Date();
    setRange(isoDay(new Date(now.getFullYear(), now.getMonth(), 1)), isoDay(now));
  }

  const keyOf = useMemo(() => {
    switch (group) {
      case "branch":
        return (r: TxReportRow) => ({
          key: r.from_branch ?? "__none__",
          label: r.from_name ?? noBranchLabel(),
        });
      case "user":
        return (r: TxReportRow) => ({
          key: r.created_by_email ?? "__none__",
          label: r.created_by_email ?? unknownUserLabel(),
        });
      case "month":
        return (r: TxReportRow) => {
          const m = r.created_at.slice(0, 7);
          return { key: m, label: m };
        };
      default:
        return (r: TxReportRow) => {
          const n = r.note?.trim() || "";
          return { key: n || "__none__", label: n || noNoteLabel() };
        };
    }
  }, [group]);

  const grouped = useMemo(() => groupTx(rows, keyOf), [rows, keyOf]);
  const totals = useMemo(
    () =>
      rows.reduce(
        (s, r) => ({
          qty: s.qty + r.qty,
          value: s.value + r.value,
          noPriceQty: s.noPriceQty + r.noPriceQty,
        }),
        { qty: 0, value: 0, noPriceQty: 0 }
      ),
    [rows]
  );

  function handleExport() {
    const csv = toCsv(
      [
        ...grouped.map((g) => ({ label: g.label, txCount: g.txCount, qty: g.qty, value: g.value })),
        { label: t("reports.grandTotal"), txCount: rows.length, qty: totals.qty, value: totals.value },
      ],
      [
        { key: "label", label: WO_GROUP_LABEL[group] },
        { key: "txCount", label: t("reports.txHeader") },
        { key: "qty", label: t("reports.qtyHeader") },
        { key: "value", label: t("reports.valueHeader") },
      ]
    );
    downloadCsv(`writeoffs-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "writeoffs", from, to, group });
  }

  const th =
    "border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
  const td = "border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0";

  return (
    <div className="space-y-4">
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Удирдлага */}
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className={lbl}>{t("reports.from")}</span>
          <input type="date" value={from} onChange={(e) => setRange(e.target.value, to)} className={ctl} />
        </label>
        <label className="text-sm">
          <span className={lbl}>{t("reports.to")}</span>
          <input type="date" value={to} onChange={(e) => setRange(from, e.target.value)} className={ctl} />
        </label>
        <div className="flex gap-1">
          <button onClick={() => presetDays(30)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.last30Days")}
          </button>
          <button onClick={() => presetDays(90)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.last90Days")}
          </button>
          <button onClick={presetThisMonth} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.thisMonth")}
          </button>
        </div>
        <label className="text-sm">
          <span className={lbl}>{t("reports.groupBy")}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as WriteoffGroup)} className={ctl + " w-44"}>
            {(Object.keys(WO_GROUP_LABEL) as WriteoffGroup[]).map((g) => (
              <option key={g} value={g}>
                {WO_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <button
          onClick={handleExport}
          disabled={grouped.length === 0}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("common.exportCsv")}
        </button>
      </div>

      {!loading && totals.noPriceQty > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("reports.noPriceWarning", { n: totals.noPriceQty.toLocaleString() })}
        </p>
      )}

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            label: t("reports.woTotal"),
            value: t("reports.amountCurrency", { amount: totals.value.toLocaleString() }),
            sub: t("reports.qtyPieces", { qty: totals.qty.toLocaleString() }),
            cls: totals.qty > 0 ? "text-rose-600" : "text-slate-900",
          },
          {
            label: t("reports.txHeader"),
            value: rows.length.toLocaleString(),
            sub: "",
            cls: "text-slate-900",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + c.cls}>{loading ? "…" : c.value}</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">{loading ? "" : c.sub}</p>
          </div>
        ))}
      </div>

      {/* Бүлэглэсэн хүснэгт */}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{WO_GROUP_LABEL[group]}</th>
              <th className={th + " text-right"}>{t("reports.txHeader")}</th>
              <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.valueHeader")}</th>
              <th className={th + " text-right"}>{t("reports.shareHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t("reports.noWriteoffs")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td + " max-w-[360px]"}>{g.label}</td>
                    <td className={td + " text-right tabular-nums"}>{g.txCount.toLocaleString()}</td>
                    <td className={td + " text-right tabular-nums"}>{g.qty.toLocaleString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>
                      {t("reports.amountCurrency", { amount: g.value.toLocaleString() })}
                    </td>
                    <td className={td + " text-right tabular-nums"}>
                      {totals.value ? ((g.value / totals.value) * 100).toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("reports.grandTotal")}</td>
                  <td className={td + " text-right tabular-nums"}>{rows.length.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{totals.qty.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>
                    {t("reports.amountCurrency", { amount: totals.value.toLocaleString() })}
                  </td>
                  <td className={td + " text-right tabular-nums"}>100%</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.woFootnote")}</p>
    </div>
  );
}
