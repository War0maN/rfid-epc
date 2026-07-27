import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from "recharts";
import { supabase } from "../lib/supabaseClient";
import {
  fetchValuation,
  groupValuation,
  VAL_GROUP_LABEL,
  type ValuationData,
  type ValuationGroup,
} from "../lib/valuation";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const CHART_CAP = 20; // графикт харуулах дээд бүлэг (борлуулалтын тайлантай ижил)

/**
 * Үлдэгдлийн үнэлгээ — ӨНӨӨДРИЙН байдлаарх снапшот (интервалгүй):
 * идэвхтэй ширхэг × одоогийн үнэ, салбар/ангилал/бараагаар бүлэглэнэ.
 */
export default function ValuationReport() {
  const { t } = useTranslation();
  const [group, setGroup] = useState<ValuationGroup>("branch");
  const [data, setData] = useState<ValuationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  function load() {
    setLoading(true);
    fetchValuation()
      .then((d) => {
        setData(d);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    fetchValuation()
      .then((d) => active && setData(d))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const grouped = useMemo(() => (data ? groupValuation(data, group) : []), [data, group]);
  const totals = useMemo(
    () =>
      grouped.reduce(
        (s, g) => ({
          qty: s.qty + g.qty,
          value: s.value + g.value,
          noPriceQty: s.noPriceQty + g.noPriceQty,
        }),
        { qty: 0, value: 0, noPriceQty: 0 }
      ),
    [grouped]
  );

  // График — дүнгээр топ-N + "Бусад" (борлуулалтын тайлантай ижил хэв маяг).
  const valueKey = t("reports.valueHeader");
  const chartData = useMemo(() => {
    const trunc = (s: string) => (s.length > 18 ? s.slice(0, 17) + "…" : s);
    const rows = grouped.slice(0, CHART_CAP);
    const out = rows.map((g) => ({ name: trunc(g.label), [valueKey]: g.value }));
    if (grouped.length > CHART_CAP) {
      const rest = grouped.slice(CHART_CAP);
      out.push({
        name: t("reports.othersBar", { n: rest.length }),
        [valueKey]: rest.reduce((s, g) => s + g.value, 0),
      });
    }
    return out;
  }, [grouped, valueKey, t]);

  function handleExport() {
    const row = (g: { label: string; sub?: string | null; qty: number; value: number; noPriceQty: number }) => ({
      label: g.label,
      sku: g.sub ?? "",
      qty: g.qty,
      value: g.value,
      noPriceQty: g.noPriceQty,
      share: totals.value ? Math.round((g.value / totals.value) * 1000) / 10 : 0,
    });
    const csv = toCsv(
      [
        ...grouped.map(row),
        row({
          label: t("reports.grandTotal"),
          sub: "",
          qty: totals.qty,
          value: totals.value,
          noPriceQty: totals.noPriceQty,
        }),
      ],
      [
        { key: "label", label: VAL_GROUP_LABEL[group] },
        { key: "sku", label: "SKU" },
        { key: "qty", label: t("reports.qtyHeader") },
        { key: "value", label: t("reports.valueHeader") },
        { key: "noPriceQty", label: t("reports.noPriceQtyHeader") },
        { key: "share", label: t("reports.shareHeader") },
      ]
    );
    downloadCsv(`valuation-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "valuation", group });
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
          <span className={lbl}>{t("reports.groupBy")}</span>
          <select value={group} onChange={(e) => setGroup(e.target.value as ValuationGroup)} className={ctl + " w-40"}>
            {(Object.keys(VAL_GROUP_LABEL) as ValuationGroup[]).map((g) => (
              <option key={g} value={g}>
                {VAL_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <p className="pb-2 text-xs text-slate-400">{t("reports.valuationAsOf", { date: new Date().toLocaleString() })}</p>
        <div className="flex-1" />
        <button onClick={load} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
          ↻ {t("reports.refresh")}
        </button>
        <button
          onClick={handleExport}
          disabled={grouped.length === 0}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("common.exportCsv")}
        </button>
      </div>

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          {
            label: t("reports.totalValue"),
            value: t("reports.amountCurrency", { amount: totals.value.toLocaleString() }),
            sub: t("reports.qtyPieces", { qty: totals.qty.toLocaleString() }),
            cls: "text-slate-900",
          },
          {
            label: t("reports.groupCount", { group: VAL_GROUP_LABEL[group] }),
            value: grouped.length.toLocaleString(),
            sub: "",
            cls: "text-slate-900",
          },
          {
            label: t("reports.noPriceQtyHeader"),
            value: totals.noPriceQty.toLocaleString(),
            sub: totals.noPriceQty > 0 ? t("reports.noPriceNote") : "",
            cls: totals.noPriceQty > 0 ? "text-amber-600" : "text-slate-900",
          },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + c.cls}>{loading ? "…" : c.value}</p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">{loading ? "" : c.sub}</p>
          </div>
        ))}
      </div>

      {/* График */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("common.loading")}</p>
        ) : chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("reports.noStock")}</p>
        ) : (
          <div className="h-96 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10, angle: -90, textAnchor: "end" }}
                  interval={0}
                  height={120}
                />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={72} />
                <Tooltip
                  formatter={(value, name) => [
                    Number(value ?? 0).toLocaleString() + t("reports.currencySuffix"),
                    String(name),
                  ]}
                />
                <Bar dataKey={valueKey} fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {!loading && grouped.length > CHART_CAP && (
          <p className="mt-1 text-center text-xs text-slate-400">{t("reports.chartCapNote", { n: CHART_CAP })}</p>
        )}
      </div>

      {/* Хүснэгт */}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{VAL_GROUP_LABEL[group]}</th>
              {group === "product" && <th className={th}>SKU</th>}
              <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.valueHeader")}</th>
              <th className={th + " text-right"}>{t("reports.noPriceQtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.shareHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={group === "product" ? 6 : 5} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={group === "product" ? 6 : 5} className="px-4 py-10 text-center text-slate-400">{t("reports.noStock")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td}>{g.label}</td>
                    {group === "product" && (
                      <td className={td + " font-mono"}>{g.sub || <span className="text-slate-300">—</span>}</td>
                    )}
                    <td className={td + " text-right tabular-nums"}>{g.qty.toLocaleString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>
                      {t("reports.amountCurrency", { amount: g.value.toLocaleString() })}
                    </td>
                    <td className={td + " text-right tabular-nums" + (g.noPriceQty > 0 ? " text-amber-600" : "")}>
                      {g.noPriceQty > 0 ? g.noPriceQty.toLocaleString() : "—"}
                    </td>
                    <td className={td + " text-right tabular-nums"}>
                      {totals.value ? ((g.value / totals.value) * 100).toFixed(1) + "%" : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("reports.grandTotal")}</td>
                  {group === "product" && <td className={td} />}
                  <td className={td + " text-right tabular-nums"}>{totals.qty.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>
                    {t("reports.amountCurrency", { amount: totals.value.toLocaleString() })}
                  </td>
                  <td className={td + " text-right tabular-nums" + (totals.noPriceQty > 0 ? " text-amber-600" : "")}>
                    {totals.noPriceQty > 0 ? totals.noPriceQty.toLocaleString() : "—"}
                  </td>
                  <td className={td + " text-right tabular-nums"}>100%</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.valuationFootnote")}</p>
    </div>
  );
}
