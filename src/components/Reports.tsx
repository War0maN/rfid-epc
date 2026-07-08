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
import { listProducts } from "../lib/products";
import {
  fetchSalesReport,
  fetchSalesTxCount,
  groupSales,
  GROUP_LABEL,
  type SalesRow,
  type SalesGroup,
  type NameMaps,
} from "../lib/reports";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const CHART_CAP = 20; // салбар/бараагаар үед графикт харуулах дээд бүлэг

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}

/** Тайлан (Phase 6) — Борлуулалт: интервал + бүлэглэлт + график + хүснэгт + CSV. */
export default function Reports() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<SalesGroup>("day");

  const [rows, setRows] = useState<SalesRow[]>([]);
  const [txCount, setTxCount] = useState(0);
  const [maps, setMaps] = useState<NameMaps>({
    branchName: new Map(),
    productName: new Map(),
    userEmail: new Map(),
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll(f: string, t: string) {
    const [sales, cnt, brs, prods, profs] = await Promise.all([
      fetchSalesReport(f, t),
      fetchSalesTxCount(f, t),
      listBranches(),
      listProducts(),
      supabase.from("profiles").select("id, email"),
    ]);
    return {
      sales,
      cnt,
      maps: {
        branchName: new Map(brs.map((b) => [b.id, b.name])),
        productName: new Map(prods.map((p) => [p.id, { name: p.name, sku: p.sku }])),
        userEmail: new Map(
          ((profs.data ?? []) as { id: string; email: string | null }[]).map((p) => [p.id, p.email])
        ),
      } satisfies NameMaps,
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
        setRows(res.sales);
        setTxCount(res.cnt);
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
        setRows(res.sales);
        setTxCount(res.cnt);
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

  const grouped = useMemo(() => groupSales(rows, group, maps), [rows, group, maps]);
  const totalQty = useMemo(() => grouped.reduce((s, g) => s + g.qty, 0), [grouped]);
  const totalAmount = useMemo(() => grouped.reduce((s, g) => s + g.amount, 0), [grouped]);

  // Графикийн цуврал нэрс (tooltip/legend-д харагдана) — идэвхтэй хэлээр.
  const amountKey = t("reports.chartAmount");
  const qtyKey = t("reports.chartQty");
  const chartData = useMemo(
    () =>
      (group === "day" || group === "month" ? grouped : grouped.slice(0, CHART_CAP)).map((g) => ({
        name: g.label.length > 16 ? g.label.slice(0, 15) + "…" : g.label,
        [amountKey]: g.amount,
        [qtyKey]: g.qty,
      })),
    [grouped, group, amountKey, qtyKey]
  );

  function handleExport() {
    const csv = toCsv(
      [
        ...grouped.map((g) => ({
          label: g.label,
          sku: g.sub ?? "",
          qty: g.qty,
          amount: g.amount,
          avg: g.qty ? Math.round(g.amount / g.qty) : 0,
        })),
        { label: t("reports.grandTotal"), sku: "", qty: totalQty, amount: totalAmount, avg: totalQty ? Math.round(totalAmount / totalQty) : 0 },
      ],
      [
        { key: "label", label: GROUP_LABEL[group] },
        { key: "sku", label: "SKU" },
        { key: "qty", label: t("reports.qtyHeader") },
        { key: "amount", label: t("reports.totalAmount") },
        { key: "avg", label: t("reports.avgPrice") },
      ]
    );
    downloadCsv(`sales-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "sales", from, to, group });
  }

  const th =
    "border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
  const td = "border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("reports.title")}</h2>
          <p className="text-sm text-slate-500">{t("reports.subtitle")}</p>
        </div>
      </div>

      {/* Дэд таб — одоогоор зөвхөн Борлуулалт; дараа шилжүүлэг г.м. нэмэгдэнэ */}
      <div className="flex gap-1 border-b border-slate-200">
        <button className="rounded-t-lg border-b-2 border-indigo-600 px-4 py-2 text-sm font-medium text-indigo-700">
          {t("reports.salesTab")}
        </button>
      </div>

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
          <select value={group} onChange={(e) => setGroup(e.target.value as SalesGroup)} className={ctl + " w-40"}>
            {(Object.keys(GROUP_LABEL) as SalesGroup[]).map((g) => (
              <option key={g} value={g}>
                {GROUP_LABEL[g]}
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

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: t("reports.totalAmount"), value: t("reports.amountCurrency", { amount: totalAmount.toLocaleString() }) },
          { label: t("reports.totalQty"), value: t("reports.qtyPieces", { qty: totalQty.toLocaleString() }) },
          { label: t("reports.txCount"), value: txCount.toLocaleString() },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{loading ? "…" : c.value}</p>
          </div>
        ))}
      </div>

      {/* График */}
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        {loading ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("common.loading")}</p>
        ) : chartData.length === 0 ? (
          <p className="py-16 text-center text-sm text-slate-400">{t("reports.noSales")}</p>
        ) : (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 8, right: 8, left: 8, bottom: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="name" tick={{ fontSize: 11 }} interval="preserveStartEnd" />
                <YAxis tick={{ fontSize: 11 }} tickFormatter={(v: number) => v.toLocaleString()} width={72} />
                <Tooltip
                  formatter={(value, name) => [
                    Number(value ?? 0).toLocaleString() +
                      (name === amountKey ? t("reports.currencySuffix") : t("reports.pcsSuffix")),
                    String(name),
                  ]}
                />
                <Bar dataKey={amountKey} fill="#6366f1" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
        {!loading && group === "product" && grouped.length > CHART_CAP && (
          <p className="mt-1 text-center text-xs text-slate-400">{t("reports.chartCapNote", { n: CHART_CAP })}</p>
        )}
      </div>

      {/* Хүснэгт */}
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{GROUP_LABEL[group]}</th>
              {group === "product" && <th className={th}>SKU</th>}
              <th className={th + " text-right"}>{t("reports.qtyHeader")}</th>
              <th className={th + " text-right"}>{t("reports.totalAmount")}</th>
              <th className={th + " text-right"}>{t("reports.avgPrice")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-slate-400">{t("reports.noSales")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td}>{g.label}</td>
                    {group === "product" && (
                      <td className={td + " font-mono"}>{g.sub || <span className="text-slate-300">—</span>}</td>
                    )}
                    <td className={td + " text-right tabular-nums"}>{g.qty.toLocaleString()}</td>
                    <td className={td + " text-right tabular-nums"}>
                      {t("reports.amountCurrency", { amount: g.amount.toLocaleString() })}
                    </td>
                    <td className={td + " text-right tabular-nums"}>
                      {g.qty
                        ? t("reports.amountCurrency", { amount: Math.round(g.amount / g.qty).toLocaleString() })
                        : "—"}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("reports.grandTotal")}</td>
                  {group === "product" && <td className={td} />}
                  <td className={td + " text-right tabular-nums"}>{totalQty.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>
                    {t("reports.amountCurrency", { amount: totalAmount.toLocaleString() })}
                  </td>
                  <td className={td + " text-right tabular-nums"}>
                    {totalQty
                      ? t("reports.amountCurrency", { amount: Math.round(totalAmount / totalQty).toLocaleString() })
                      : "—"}
                  </td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.footnote")}</p>
    </div>
  );
}
