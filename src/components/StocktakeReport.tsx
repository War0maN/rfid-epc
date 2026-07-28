import { useEffect, useMemo, useRef, useState } from "react";
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
import { listBranches } from "../lib/branches";
import { listProducts, type ProductRow } from "../lib/products";
import {
  fetchStocktakeReport,
  groupStocktake,
  ST_GROUP_LABEL,
  type StocktakeRow,
  type StocktakeGroup,
  type StocktakeMaps,
} from "../lib/stocktakeReport";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const CHART_CAP = 20; // графикт харуулах дээд бүлэг (бусад тайлантай ижил)

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/**
 * Тооллогын зөрүүний тайлан (shrinkage) — хаагдсан тооллогуудын
 * бүртгэлтэй/тоологдсон/дутуу/илүү, дутуугийн мөнгөн дүн, гүйцэтгэлийн %.
 */
export default function StocktakeReport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(90));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<StocktakeGroup>("stocktake");

  const [rows, setRows] = useState<StocktakeRow[]>([]);
  const [maps, setMaps] = useState<StocktakeMaps>({
    branchName: new Map(),
    products: new Map<string, ProductRow>(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll(f: string, t: string) {
    const [report, brs, prods] = await Promise.all([
      fetchStocktakeReport(f, t),
      listBranches(),
      listProducts(),
    ]);
    return {
      report,
      maps: {
        branchName: new Map(brs.map((b) => [b.id, b.name])),
        products: new Map(prods.map((p) => [p.id, p])),
      } satisfies StocktakeMaps,
    };
  }

  // Сүүлийн хүсэлтийг таних тоолуур — хуучирсан интервалын хариу дарж бичихгүй.
  const req = useRef(0);
  function load(f: string, t: string) {
    if (!f || !t) return;
    setLoading(true);
    const r = ++req.current;
    fetchAll(f, t)
      .then((res) => {
        if (req.current !== r) return;
        setRows(res.report);
        setMaps(res.maps);
        setError(null);
      })
      .catch((e) => req.current === r && setError(errorMessage(e)))
      .finally(() => req.current === r && setLoading(false));
  }

  // Эхний ачаалал (default интервалаар).
  useEffect(() => {
    let active = true;
    const r = ++req.current;
    fetchAll(from, to)
      .then((res) => {
        if (!active || req.current !== r) return;
        setRows(res.report);
        setMaps(res.maps);
      })
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

  const grouped = useMemo(() => groupStocktake(rows, group, maps), [rows, group, maps]);
  const totals = useMemo(
    () =>
      grouped.reduce(
        (s, g) => ({
          expected: s.expected + g.expected,
          found: s.found + g.found,
          missing: s.missing + g.missing,
          extra: s.extra + g.extra,
          missingValue: s.missingValue + g.missingValue,
          noPriceMissing: s.noPriceMissing + g.noPriceMissing,
        }),
        { expected: 0, found: 0, missing: 0, extra: 0, missingValue: 0, noPriceMissing: 0 }
      ),
    [grouped]
  );
  const stCount = useMemo(() => new Set(rows.map((r) => r.stocktake_id)).size, [rows]);
  const accuracy = totals.expected ? (totals.found / totals.expected) * 100 : null;

  // График — дутуугийн дүнгээр (улаан өнгө: алдагдал).
  const missingKey = t("reports.missingValueHeader");
  const isTimeGroup = group === "month";
  const chartData = useMemo(() => {
    const trunc = (s: string) => (s.length > 18 ? s.slice(0, 17) + "…" : s);
    const src = isTimeGroup ? grouped : grouped.slice(0, CHART_CAP);
    const data = src.map((g) => ({ name: trunc(g.label), [missingKey]: g.missingValue }));
    if (!isTimeGroup && grouped.length > CHART_CAP) {
      const rest = grouped.slice(CHART_CAP);
      data.push({
        name: t("reports.othersBar", { n: rest.length }),
        [missingKey]: rest.reduce((s, g) => s + g.missingValue, 0),
      });
    }
    return data;
  }, [grouped, isTimeGroup, missingKey, t]);

  function handleExport() {
    const row = (g: {
      label: string;
      sub?: string | null;
      expected: number;
      found: number;
      missing: number;
      extra: number;
      missingValue: number;
    }) => ({
      label: g.label,
      sub: g.sub ?? "",
      expected: g.expected,
      found: g.found,
      missing: g.missing,
      missingValue: g.missingValue,
      extra: g.extra,
      accuracy: g.expected ? Math.round((g.found / g.expected) * 1000) / 10 : "",
    });
    const csv = toCsv(
      [
        ...grouped.map(row),
        row({
          label: t("reports.grandTotal"),
          sub: "",
          expected: totals.expected,
          found: totals.found,
          missing: totals.missing,
          extra: totals.extra,
          missingValue: totals.missingValue,
        }),
      ],
      [
        { key: "label", label: ST_GROUP_LABEL[group] },
        { key: "sub", label: group === "product" ? "SKU" : t("reports.stInfoHeader") },
        { key: "expected", label: t("reports.expectedHeader") },
        { key: "found", label: t("reports.foundHeader") },
        { key: "missing", label: t("reports.missingHeader") },
        { key: "missingValue", label: t("reports.missingValueHeader") },
        { key: "extra", label: t("reports.extraHeader") },
        { key: "accuracy", label: t("reports.accuracyHeader") },
      ]
    );
    downloadCsv(`stocktake-variance-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "stocktake", from, to, group });
  }

  const showSub = group === "stocktake" || group === "product";
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
          <select value={group} onChange={(e) => setGroup(e.target.value as StocktakeGroup)} className={ctl + " w-40"}>
            {(Object.keys(ST_GROUP_LABEL) as StocktakeGroup[]).map((g) => (
              <option key={g} value={g}>
                {ST_GROUP_LABEL[g]}
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

      {/* Үнэгүй дутуу бараа байвал л анхааруулна — алдагдлын дүн дутуу гарч буйг мэдэгдэнэ. */}
      {!loading && totals.noPriceMissing > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("reports.noPriceWarning", { n: totals.noPriceMissing.toLocaleString() })}
        </p>
      )}

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            label: t("reports.totalMissing"),
            value: t("reports.amountCurrency", { amount: totals.missingValue.toLocaleString() }),
            sub: t("reports.qtyPieces", { qty: totals.missing.toLocaleString() }),
            cls: totals.missing > 0 ? "text-rose-600" : "text-slate-900",
          },
          {
            label: t("reports.accuracyHeader"),
            value: accuracy != null ? accuracy.toFixed(1) + "%" : "—",
            sub: t("reports.accuracySub", {
              found: totals.found.toLocaleString(),
              expected: totals.expected.toLocaleString(),
            }),
            cls:
              accuracy == null
                ? "text-slate-900"
                : accuracy >= 99
                  ? "text-emerald-600"
                  : accuracy >= 95
                    ? "text-amber-600"
                    : "text-rose-600",
          },
          {
            label: t("reports.extraHeader"),
            value: totals.extra.toLocaleString(),
            sub: totals.extra > 0 ? t("reports.extraSub") : "",
            cls: totals.extra > 0 ? "text-amber-600" : "text-slate-900",
          },
          {
            label: t("reports.stCount"),
            value: stCount.toLocaleString(),
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

      {/* График — дутуугийн дүнгээр */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("common.loading")}</p>
        ) : chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("reports.noStocktakes")}</p>
        ) : (
          <div className={(isTimeGroup ? "h-72" : "h-96") + " w-full"}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                {isTimeGroup ? (
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                ) : (
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 10, angle: -90, textAnchor: "end" }}
                    interval={0}
                    height={120}
                  />
                )}
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={72} />
                <Tooltip
                  formatter={(value, name) => [
                    Number(value ?? 0).toLocaleString() + t("reports.currencySuffix"),
                    String(name),
                  ]}
                />
                <Bar dataKey={missingKey} fill="#f43f5e" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {!loading && !isTimeGroup && grouped.length > CHART_CAP && (
          <p className="mt-1 text-center text-xs text-slate-400">{t("reports.chartCapNote", { n: CHART_CAP })}</p>
        )}
      </div>

      {/* Хүснэгт */}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{ST_GROUP_LABEL[group]}</th>
              {showSub && <th className={th}>{group === "product" ? "SKU" : t("reports.stInfoHeader")}</th>}
              <th className={th + " text-right"}>{t("reports.expectedHeader")}</th>
              <th className={th + " text-right"}>{t("reports.foundHeader")}</th>
              <th className={th + " text-right"}>{t("reports.missingHeader")}</th>
              <th className={th + " text-right"}>{t("reports.missingValueHeader")}</th>
              <th className={th + " text-right"}>{t("reports.extraHeader")}</th>
              <th className={th + " text-right"}>{t("reports.accuracyHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showSub ? 8 : 7} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={showSub ? 8 : 7} className="px-4 py-10 text-center text-slate-400">{t("reports.noStocktakes")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => {
                  const acc = g.expected ? (g.found / g.expected) * 100 : null;
                  return (
                    <tr key={g.key} className="hover:bg-slate-50">
                      <td className={td}>{g.label}</td>
                      {showSub && (
                        <td className={td + (group === "product" ? " font-mono" : " text-slate-500")}>
                          {g.sub || <span className="text-slate-300">—</span>}
                        </td>
                      )}
                      <td className={td + " text-right tabular-nums"}>{g.expected.toLocaleString()}</td>
                      <td className={td + " text-right tabular-nums"}>{g.found.toLocaleString()}</td>
                      <td className={td + " text-right tabular-nums" + (g.missing > 0 ? " font-semibold text-rose-600" : "")}>
                        {g.missing.toLocaleString()}
                      </td>
                      <td className={td + " text-right tabular-nums" + (g.missingValue > 0 ? " font-semibold text-rose-600" : "")}>
                        {t("reports.amountCurrency", { amount: g.missingValue.toLocaleString() })}
                      </td>
                      <td className={td + " text-right tabular-nums" + (g.extra > 0 ? " text-amber-600" : "")}>
                        {g.extra > 0 ? g.extra.toLocaleString() : "—"}
                      </td>
                      <td className={td + " text-right tabular-nums"}>
                        {acc != null ? acc.toFixed(1) + "%" : "—"}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("reports.grandTotal")}</td>
                  {showSub && <td className={td} />}
                  <td className={td + " text-right tabular-nums"}>{totals.expected.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{totals.found.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums" + (totals.missing > 0 ? " text-rose-600" : "")}>
                    {totals.missing.toLocaleString()}
                  </td>
                  <td className={td + " text-right tabular-nums" + (totals.missingValue > 0 ? " text-rose-600" : "")}>
                    {t("reports.amountCurrency", { amount: totals.missingValue.toLocaleString() })}
                  </td>
                  <td className={td + " text-right tabular-nums" + (totals.extra > 0 ? " text-amber-600" : "")}>
                    {totals.extra > 0 ? totals.extra.toLocaleString() : "—"}
                  </td>
                  <td className={td + " text-right tabular-nums"}>
                    {accuracy != null ? accuracy.toFixed(1) + "%" : "—"}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.stocktakeFootnote")}</p>
    </div>
  );
}
