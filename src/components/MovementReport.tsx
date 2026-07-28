import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { listProducts, type ProductRow } from "../lib/products";
import {
  fetchMovementReport,
  groupMovement,
  MV_GROUP_LABEL,
  type MovementRow,
  type MovementGroup,
} from "../lib/movement";
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
 * Бараа материалын хөдөлгөөний тайлан (Inventory Movement) — олон улсын
 * стандарт: Эхний үлдэгдэл + Орлого − Зарлага = Эцсийн үлдэгдэл, бараа
 * бүрээр өртөг + зарах үнийн хоёр үнэлгээтэй. Компанийн түвшинд
 * (салбар хоорондын шилжүүлэг хөдөлгөөнд тооцогдохгүй).
 */
export default function MovementReport() {
  const { t } = useTranslation();
  const [from, setFrom] = useState(daysAgo(30));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<MovementGroup>("product");

  const [rows, setRows] = useState<MovementRow[]>([]);
  const [products, setProducts] = useState<Map<string, ProductRow>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function fetchAll(f: string, t: string) {
    const [report, prods] = await Promise.all([fetchMovementReport(f, t), listProducts()]);
    return { report, products: new Map(prods.map((p) => [p.id, p])) };
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
        setProducts(res.products);
        setError(null);
      })
      .catch((e) => req.current === r && setError(errorMessage(e)))
      .finally(() => req.current === r && setLoading(false));
  }

  useEffect(() => {
    let active = true;
    const r = ++req.current;
    fetchAll(from, to)
      .then((res) => {
        if (!active || req.current !== r) return;
        setRows(res.report);
        setProducts(res.products);
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

  const grouped = useMemo(() => groupMovement(rows, group, products), [rows, group, products]);
  const totals = useMemo(
    () =>
      grouped.reduce(
        (s, g) => ({
          opening: s.opening + g.opening,
          inQty: s.inQty + g.inQty,
          outQty: s.outQty + g.outQty,
          closing: s.closing + g.closing,
          openingCost: s.openingCost + g.openingCost,
          openingRetail: s.openingRetail + g.openingRetail,
          inCost: s.inCost + g.inCost,
          inRetail: s.inRetail + g.inRetail,
          outCost: s.outCost + g.outCost,
          outRetail: s.outRetail + g.outRetail,
          closingCost: s.closingCost + g.closingCost,
          closingRetail: s.closingRetail + g.closingRetail,
          noCostQty: s.noCostQty + g.noCostQty,
          noPriceQty: s.noPriceQty + g.noPriceQty,
        }),
        {
          opening: 0, inQty: 0, outQty: 0, closing: 0,
          openingCost: 0, openingRetail: 0, inCost: 0, inRetail: 0,
          outCost: 0, outRetail: 0, closingCost: 0, closingRetail: 0,
          noCostQty: 0, noPriceQty: 0,
        }
      ),
    [grouped]
  );

  function handleExport() {
    const row = (g: (typeof grouped)[number]) => ({
      label: g.label,
      sku: g.sub ?? "",
      opening: g.opening, openingCost: g.openingCost, openingRetail: g.openingRetail,
      inQty: g.inQty, inCost: g.inCost, inRetail: g.inRetail,
      outQty: g.outQty, outCost: g.outCost, outRetail: g.outRetail,
      closing: g.closing, closingCost: g.closingCost, closingRetail: g.closingRetail,
    });
    const totalRow = {
      ...row({ ...totals, key: "", label: t("reports.grandTotal"), sub: "" } as (typeof grouped)[number]),
    };
    const cols: { key: keyof ReturnType<typeof row>; label: string }[] = [
      { key: "label", label: MV_GROUP_LABEL[group] },
      { key: "sku", label: "SKU" },
      { key: "opening", label: t("reports.mvOpening") + " (" + t("reports.qtyShort") + ")" },
      { key: "openingCost", label: t("reports.mvOpening") + " (" + t("reports.costShort") + ")" },
      { key: "openingRetail", label: t("reports.mvOpening") + " (" + t("reports.retailShort") + ")" },
      { key: "inQty", label: t("reports.mvIn") + " (" + t("reports.qtyShort") + ")" },
      { key: "inCost", label: t("reports.mvIn") + " (" + t("reports.costShort") + ")" },
      { key: "inRetail", label: t("reports.mvIn") + " (" + t("reports.retailShort") + ")" },
      { key: "outQty", label: t("reports.mvOut") + " (" + t("reports.qtyShort") + ")" },
      { key: "outCost", label: t("reports.mvOut") + " (" + t("reports.costShort") + ")" },
      { key: "outRetail", label: t("reports.mvOut") + " (" + t("reports.retailShort") + ")" },
      { key: "closing", label: t("reports.mvClosing") + " (" + t("reports.qtyShort") + ")" },
      { key: "closingCost", label: t("reports.mvClosing") + " (" + t("reports.costShort") + ")" },
      { key: "closingRetail", label: t("reports.mvClosing") + " (" + t("reports.retailShort") + ")" },
    ];
    downloadCsv(
      `movement-${from}-${to}.csv`,
      toCsv([...grouped.map(row), totalRow], cols)
    );
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "movement", from, to, group });
  }

  const th =
    "border-b border-r border-slate-200 bg-slate-50 px-2 py-2 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
  const thGroup =
    "border-b border-r border-slate-300 bg-slate-100 px-2 py-1.5 text-center text-xs font-semibold uppercase tracking-wide text-slate-600 last:border-r-0";
  const td = "border-b border-r border-slate-100 px-2 py-2 text-right text-xs tabular-nums text-slate-700 last:border-r-0";
  const fmt = (n: number) => n.toLocaleString();

  /** Нэг бүлгийн (Эхний/Орлого/Зарлага/Эцсийн) 3 багана — тоо, өртөг, зарах. */
  const section = (qty: number, cost: number, retail: number, hl = false) => (
    <>
      <td className={td + (hl ? " font-semibold" : "")}>{fmt(qty)}</td>
      <td className={td}>{fmt(cost)}</td>
      <td className={td + " text-slate-500"}>{fmt(retail)}</td>
    </>
  );

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
          <select value={group} onChange={(e) => setGroup(e.target.value as MovementGroup)} className={ctl + " w-40"}>
            {(Object.keys(MV_GROUP_LABEL) as MovementGroup[]).map((g) => (
              <option key={g} value={g}>
                {MV_GROUP_LABEL[g]}
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

      {/* Өртөг/үнэ бөглөгдөөгүй бараа байвал л анхааруулна. */}
      {!loading && (totals.noCostQty > 0 || totals.noPriceQty > 0) && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          {t("reports.mvNoCostWarning", {
            cost: totals.noCostQty.toLocaleString(),
            price: totals.noPriceQty.toLocaleString(),
          })}
        </p>
      )}

      {/* Нийлбэр картууд — өртгөөр (олон улсын стандарт: санхүү өртгөөр явна) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: t("reports.mvOpening"), qty: totals.opening, amt: totals.openingCost },
          { label: t("reports.mvIn"), qty: totals.inQty, amt: totals.inCost },
          { label: t("reports.mvOut"), qty: totals.outQty, amt: totals.outCost },
          { label: t("reports.mvClosing"), qty: totals.closing, amt: totals.closingCost },
        ].map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {loading ? "…" : t("reports.amountCurrency", { amount: c.amt.toLocaleString() })}
            </p>
            <p className="mt-0.5 text-xs tabular-nums text-slate-400">
              {loading ? "" : t("reports.qtyPieces", { qty: c.qty.toLocaleString() })}
            </p>
          </div>
        ))}
      </div>

      {/* Хүснэгт — 4 бүлэг × (тоо | өртөг | зарах үнэ) */}
      <div className="max-h-[60vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={thGroup} colSpan={group === "product" ? 2 : 1} />
              <th className={thGroup} colSpan={3}>{t("reports.mvOpening")}</th>
              <th className={thGroup} colSpan={3}>{t("reports.mvIn")}</th>
              <th className={thGroup} colSpan={3}>{t("reports.mvOut")}</th>
              <th className={thGroup} colSpan={3}>{t("reports.mvClosing")}</th>
            </tr>
            <tr>
              <th className={th + " text-left"}>{MV_GROUP_LABEL[group]}</th>
              {group === "product" && <th className={th + " text-left"}>SKU</th>}
              {Array.from({ length: 4 }).flatMap((_, i) => [
                <th key={"q" + i} className={th}>{t("reports.qtyShort")}</th>,
                <th key={"c" + i} className={th}>{t("reports.costShort")}</th>,
                <th key={"r" + i} className={th}>{t("reports.retailShort")}</th>,
              ])}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={14} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : grouped.length === 0 ? (
              <tr><td colSpan={14} className="px-4 py-10 text-center text-slate-400">{t("reports.mvNoData")}</td></tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td + " text-left"}>{g.label}</td>
                    {group === "product" && (
                      <td className={td + " text-left font-mono"}>{g.sub || <span className="text-slate-300">—</span>}</td>
                    )}
                    {section(g.opening, g.openingCost, g.openingRetail)}
                    {section(g.inQty, g.inCost, g.inRetail)}
                    {section(g.outQty, g.outCost, g.outRetail)}
                    {section(g.closing, g.closingCost, g.closingRetail, true)}
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td + " text-left"}>{t("reports.grandTotal")}</td>
                  {group === "product" && <td className={td} />}
                  {section(totals.opening, totals.openingCost, totals.openingRetail)}
                  {section(totals.inQty, totals.inCost, totals.inRetail)}
                  {section(totals.outQty, totals.outCost, totals.outRetail)}
                  {section(totals.closing, totals.closingCost, totals.closingRetail, true)}
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("reports.mvFootnote")}</p>
    </div>
  );
}
