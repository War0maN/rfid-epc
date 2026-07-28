import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import {
  fetchTxReport,
  groupTx,
  TRF_GROUP_LABEL,
  noBranchLabel,
  type TxReportRow,
  type TransferGroup,
} from "../lib/txReports";
import { TX_STATUS_LABEL, TX_STATUS_BADGE } from "../lib/transactions";
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
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
}

/**
 * Шилжүүлгийн тайлан — салбар хоорондын TRF урсгал: чиглэлээр/сараар/
 * төлөвөөр нэгтгэл + хүлээгдэж буй (гацсан) шилжүүлгийн жагсаалт.
 * Дүн = гүйлгээний үеийн snapshot үнэ.
 */
export default function TransferReport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<TransferGroup>("direction");

  const [rows, setRows] = useState<TxReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const req = useRef(0);
  function load(f: string, t: string) {
    if (!f || !t) return;
    setLoading(true);
    const r = ++req.current;
    fetchTxReport("transfer", f, t)
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
    fetchTxReport("transfer", from, to)
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
      case "month":
        return (r: TxReportRow) => {
          const m = r.created_at.slice(0, 7);
          return { key: m, label: m };
        };
      case "status":
        return (r: TxReportRow) => ({ key: r.status, label: TX_STATUS_LABEL[r.status] });
      default:
        return (r: TxReportRow) => {
          const f = r.from_name ?? noBranchLabel();
          const tn = r.to_name ?? "?";
          return { key: `${r.from_branch}|${r.to_branch}`, label: `${f} → ${tn}` };
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
  const pending = useMemo(
    () => rows.filter((r) => r.status === "pending").sort((a, b) => a.created_at.localeCompare(b.created_at)),
    [rows]
  );
  const cancelled = useMemo(() => rows.filter((r) => r.status === "cancelled").length, [rows]);
  const maxPendingDays = pending.length > 0 ? daysSince(pending[0].created_at) : 0;

  function handleExport() {
    const csv = toCsv(
      [
        ...grouped.map((g) => ({ label: g.label, txCount: g.txCount, qty: g.qty, value: g.value })),
        { label: t("reports.grandTotal"), txCount: rows.length, qty: totals.qty, value: totals.value },
      ],
      [
        { key: "label", label: TRF_GROUP_LABEL[group] },
        { key: "txCount", label: t("reports.txHeader") },
        { key: "qty", label: t("reports.qtyHeader") },
        { key: "value", label: t("reports.valueHeader") },
      ]
    );
    downloadCsv(`transfers-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "transfers", from, to, group });
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
          <button onClick={() => presetDays(7)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.last7Days")}
          </button>
          <button onClick={() => presetDays(30)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.last30Days")}
          </button>
          <button onClick={presetThisMonth} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.thisMonth")}
          </button>
        </div>
        <label className="text-sm">
          <span className={lbl}>{t("reports.groupBy")}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as TransferGroup)} className={ctl + " w-40"}>
            {(Object.keys(TRF_GROUP_LABEL) as TransferGroup[]).map((g) => (
              <option key={g} value={g}>
                {TRF_GROUP_LABEL[g]}
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
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: t("reports.trfTotal"),
            value: t("reports.amountCurrency", { amount: totals.value.toLocaleString() }),
            sub: t("reports.qtyPieces", { qty: totals.qty.toLocaleString() }),
            cls: "text-slate-900",
          },
          {
            label: t("reports.txHeader"),
            value: rows.length.toLocaleString(),
            sub: cancelled > 0 ? t("reports.trfCancelled", { n: cancelled.toLocaleString() }) : "",
            cls: "text-slate-900",
          },
          {
            label: t("reports.trfPending"),
            value: pending.length.toLocaleString(),
            sub: pending.length > 0 ? t("reports.trfOldest", { n: maxPendingDays.toLocaleString() }) : "",
            cls: pending.length > 0 ? "text-amber-600" : "text-slate-900",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + c.cls}>{loading ? "…" : c.value}</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">{loading ? "" : c.sub}</p>
          </div>
        ))}
      </div>

      {/* Хүлээгдэж буй (гацсан) шилжүүлгүүд — хамгийн удаан нь эхэндээ */}
      {!loading && pending.length > 0 && (
        <div className="overflow-auto rounded-xl border border-amber-200 bg-white shadow-sm">
          <div className="border-b border-amber-100 bg-amber-50/60 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-amber-700">
            {t("reports.trfPendingTitle", { n: pending.length })}
          </div>
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={th}>№</th>
                <th className={th}>{t("reports.groupDirection")}</th>
                <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
                <th className={th + " text-right"}>{t("reports.valueHeader")}</th>
                <th className={th}>{t("common.date")}</th>
                <th className={th + " text-right"}>{t("reports.trfDays")}</th>
              </tr>
            </thead>
            <tbody>
              {pending.map((r) => {
                const days = daysSince(r.created_at);
                return (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className={td + " font-mono"}>{r.tx_number ?? "—"}</td>
                    <td className={td}>{(r.from_name ?? noBranchLabel()) + " → " + (r.to_name ?? "?")}</td>
                    <td className={td + " text-right tabular-nums"}>{r.qty.toLocaleString()}</td>
                    <td className={td + " text-right tabular-nums"}>
                      {t("reports.amountCurrency", { amount: r.value.toLocaleString() })}
                    </td>
                    <td className={td}>{new Date(r.created_at).toLocaleDateString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums" + (days >= 3 ? " text-rose-600" : days >= 1 ? " text-amber-600" : "")}>
                      {days}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Бүлэглэсэн хүснэгт */}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{TRF_GROUP_LABEL[group]}</th>
              <th className={th + " text-right"}>{t("reports.txHeader")}</th>
              <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.valueHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={4} className="px-4 py-10 text-center text-slate-400">{t("reports.noTransfers")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td}>
                      {group === "status" ? (
                        <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + (TX_STATUS_BADGE[g.key as keyof typeof TX_STATUS_BADGE] ?? "")}>
                          {g.label}
                        </span>
                      ) : (
                        g.label
                      )}
                    </td>
                    <td className={td + " text-right tabular-nums"}>{g.txCount.toLocaleString()}</td>
                    <td className={td + " text-right tabular-nums"}>{g.qty.toLocaleString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>
                      {t("reports.amountCurrency", { amount: g.value.toLocaleString() })}
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
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.trfFootnote")}</p>
    </div>
  );
}
