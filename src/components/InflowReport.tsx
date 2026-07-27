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
  fetchInflowReport,
  groupInflow,
  INFLOW_GROUP_LABEL,
  type InflowRow,
  type InflowGroup,
  type InflowMaps,
} from "../lib/inflow";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const CHART_CAP = 20; // категорийн бүлэглэлтэд графикт харуулах дээд бүлэг

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/**
 * Орлогын тайлан — интервалд шинээр орж ирсэн (EPC үүссэн) бараа,
 * бүх үүсгэлтийн замаар, төлөв үл хамааран. Дүн = одоогийн үнээр.
 */
export default function InflowReport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<InflowGroup>("day");

  const [rows, setRows] = useState<InflowRow[]>([]);
  const [maps, setMaps] = useState<InflowMaps>({
    branchName: new Map(),
    products: new Map<string, ProductRow>(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll(f: string, t: string) {
    const [inflow, brs, prods] = await Promise.all([
      fetchInflowReport(f, t),
      listBranches(),
      listProducts(),
    ]);
    return {
      inflow,
      maps: {
        branchName: new Map(brs.map((b) => [b.id, b.name])),
        products: new Map(prods.map((p) => [p.id, p])),
      } satisfies InflowMaps,
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
        setRows(res.inflow);
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
        setRows(res.inflow);
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

  const grouped = useMemo(() => groupInflow(rows, group, maps), [rows, group, maps]);
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
  const jobCount = useMemo(() => new Set(rows.map((r) => r.job_number ?? "?")).size, [rows]);

  // График — цуврал нэр идэвхтэй хэлээр; он цагийн бүлэглэлтэд бүх багана.
  const valueKey = t("reports.valueHeader");
  const isTimeGroup = group === "day" || group === "month";
  const chartData = useMemo(() => {
    const trunc = (s: string) => (s.length > 18 ? s.slice(0, 17) + "…" : s);
    const src = isTimeGroup ? grouped : grouped.slice(0, CHART_CAP);
    const data = src.map((g) => ({ name: trunc(g.label), [valueKey]: g.value }));
    if (!isTimeGroup && grouped.length > CHART_CAP) {
      const rest = grouped.slice(CHART_CAP);
      data.push({
        name: t("reports.othersBar", { n: rest.length }),
        [valueKey]: rest.reduce((s, g) => s + g.value, 0),
      });
    }
    return data;
  }, [grouped, isTimeGroup, valueKey, t]);

  function handleExport() {
    const row = (g: { label: string; sub?: string | null; qty: number; value: number }) => ({
      label: g.label,
      sub: g.sub ?? "",
      qty: g.qty,
      value: g.value,
    });
    const csv = toCsv(
      [
        ...grouped.map(row),
        row({ label: t("reports.grandTotal"), sub: "", qty: totals.qty, value: totals.value }),
      ],
      [
        { key: "label", label: INFLOW_GROUP_LABEL[group] },
        { key: "sub", label: group === "job" ? t("reports.supplierHeader") : "SKU" },
        { key: "qty", label: t("reports.qtyHeader") },
        { key: "value", label: t("reports.valueHeader") },
      ]
    );
    downloadCsv(`inflow-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "inflow", from, to, group });
  }

  const showSub = group === "product" || group === "job";
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
          <button onClick={() => presetDays(0)} className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50">
            {t("reports.today")}
          </button>
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
          <select value={group} onChange={(e) => setGroup(e.target.value as InflowGroup)} className={ctl + " w-40"}>
            {(Object.keys(INFLOW_GROUP_LABEL) as InflowGroup[]).map((g) => (
              <option key={g} value={g}>
                {INFLOW_GROUP_LABEL[g]}
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

      {/* Үнэгүй бараа байвал л анхааруулна — дүн дутуу гарч буйг мэдэгдэнэ. */}
      {!loading && totals.noPriceQty > 0 && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("reports.noPriceWarning", { n: totals.noPriceQty.toLocaleString() })}
        </p>
      )}

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[
          {
            label: t("reports.inflowTotal"),
            value: t("reports.amountCurrency", { amount: totals.value.toLocaleString() }),
            sub: t("reports.qtyPieces", { qty: totals.qty.toLocaleString() }),
            cls: "text-slate-900",
          },
          {
            label: t("reports.jobCount"),
            value: jobCount.toLocaleString(),
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

      {/* График */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("common.loading")}</p>
        ) : chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("reports.noInflow")}</p>
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
                <Bar dataKey={valueKey} fill="#10b981" radius={[3, 3, 0, 0]} />
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
              <th className={th}>{INFLOW_GROUP_LABEL[group]}</th>
              {showSub && <th className={th}>{group === "job" ? t("reports.supplierHeader") : "SKU"}</th>}
              <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.valueHeader")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={showSub ? 4 : 3} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={showSub ? 4 : 3} className="px-4 py-10 text-center text-slate-400">{t("reports.noInflow")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td}>{g.label}</td>
                    {showSub && (
                      <td className={td + (group === "product" ? " font-mono" : "")}>
                        {g.sub || <span className="text-slate-300">—</span>}
                      </td>
                    )}
                    <td className={td + " text-right tabular-nums"}>{g.qty.toLocaleString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>
                      {t("reports.amountCurrency", { amount: g.value.toLocaleString() })}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("reports.grandTotal")}</td>
                  {showSub && <td className={td} />}
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
      <p className="text-xs text-slate-400">{t("reports.inflowFootnote")}</p>
    </div>
  );
}
