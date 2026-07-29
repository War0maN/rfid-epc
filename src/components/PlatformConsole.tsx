import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import {
  fetchPlatformOverview,
  fetchLabelSeries,
  groupLabels,
  LABEL_GROUP_LABEL,
  type PlatformTenant,
  type LabelSeriesRow,
  type LabelGroup,
} from "../lib/platform";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const th =
  "border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
const td = "border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0";

function isoDay(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return isoDay(d);
}
function monthsAgo(n: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  return isoDay(d);
}
/** Огноо/цагийг богиноор (утга байхгүй бол зураас). */
function dt(v: string | null): string {
  return v ? new Date(v).toLocaleDateString() : "—";
}

/**
 * Платформын нэгдсэн хяналт — бүх харилцагч компанийн хэрэглээ нэг дэлгэцэнд.
 * Бүх дата platform_* security definer RPC-ээр ирнэ (эрхийн шалгалт DB талд);
 * энэ таб өөрөө зөвхөн платформын админд харагдана.
 */
export default function PlatformConsole() {
  const { t } = useTranslation();

  const [tenants, setTenants] = useState<PlatformTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Шошгоны хэрэглээний интервал (анхдагч: сүүлийн 12 сар, сараар).
  const [from, setFrom] = useState(monthsAgo(12));
  const [to, setTo] = useState(isoDay(new Date()));
  const [group, setGroup] = useState<LabelGroup>("month");
  const [series, setSeries] = useState<LabelSeriesRow[]>([]);
  const [seriesLoading, setSeriesLoading] = useState(true);

  useEffect(() => {
    let active = true;
    fetchPlatformOverview()
      .then((rows) => active && setTenants(rows))
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const req = useRef(0);
  function loadSeries(f: string, tt: string) {
    if (!f || !tt) return;
    setSeriesLoading(true);
    const r = ++req.current;
    fetchLabelSeries(f, tt)
      .then((rows) => {
        if (req.current !== r) return;
        setSeries(rows);
        setError(null);
      })
      .catch((e) => req.current === r && setError(errorMessage(e)))
      .finally(() => req.current === r && setSeriesLoading(false));
  }

  useEffect(() => {
    let active = true;
    const r = ++req.current;
    fetchLabelSeries(from, to)
      .then((rows) => active && req.current === r && setSeries(rows))
      .catch((e) => active && req.current === r && setError(errorMessage(e)))
      .finally(() => active && req.current === r && setSeriesLoading(false));
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function setRange(f: string, tt: string) {
    setFrom(f);
    setTo(tt);
    loadSeries(f, tt);
  }

  const tenantName = useMemo(
    () => new Map(tenants.map((x) => [x.tenant_id, x.tenant_name])),
    [tenants]
  );
  const grouped = useMemo(() => groupLabels(series, group, tenantName), [series, group, tenantName]);

  // Дээд картуудын нийлбэр — бүх компаниар (интервалаас хамаарахгүй, нийт байдал).
  const totals = useMemo(
    () =>
      tenants.reduce(
        (s, x) => ({
          users: s.users + x.users,
          branches: s.branches + x.branches,
          epcTotal: s.epcTotal + x.epc_total,
          labels: s.labels + x.labels_printed,
        }),
        { users: 0, branches: 0, epcTotal: 0, labels: 0 }
      ),
    [tenants]
  );
  const seriesTotals = useMemo(
    () =>
      grouped.reduce(
        (s, g) => ({
          firstPrints: s.firstPrints + g.firstPrints,
          reprints: s.reprints + g.reprints,
          total: s.total + g.total,
        }),
        { firstPrints: 0, reprints: 0, total: 0 }
      ),
    [grouped]
  );

  function exportTenants() {
    const csv = toCsv(
      tenants.map((x) => ({
        name: x.tenant_name,
        created: x.created_at.slice(0, 10),
        users: x.users,
        branches: x.branches,
        products: x.products,
        epcTotal: x.epc_total,
        epcPrinted: x.epc_printed,
        labels: x.labels_printed,
        active: x.epc_active,
        sold: x.epc_sold,
        tx: x.tx_count,
        lastActivity: x.last_activity?.slice(0, 10) ?? "",
        lastSignIn: x.last_sign_in?.slice(0, 10) ?? "",
      })),
      [
        { key: "name", label: t("platform.thTenant") },
        { key: "created", label: t("platform.thCreated") },
        { key: "users", label: t("platform.thUsers") },
        { key: "branches", label: t("platform.thBranches") },
        { key: "products", label: t("platform.thProducts") },
        { key: "epcTotal", label: t("platform.thEpcTotal") },
        { key: "epcPrinted", label: t("platform.thEpcPrinted") },
        { key: "labels", label: t("platform.thLabels") },
        { key: "active", label: t("platform.thActive") },
        { key: "sold", label: t("platform.thSold") },
        { key: "tx", label: t("platform.thTx") },
        { key: "lastActivity", label: t("platform.thLastActivity") },
        { key: "lastSignIn", label: t("platform.thLastSignIn") },
      ]
    );
    downloadCsv(`platform-tenants-${isoDay(new Date())}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, { report: "platform_tenants" });
  }

  function exportLabels() {
    const csv = toCsv(
      [
        ...grouped.map((g) => ({
          label: g.label,
          firstPrints: g.firstPrints,
          reprints: g.reprints,
          total: g.total,
        })),
        {
          label: t("platform.grandTotal"),
          firstPrints: seriesTotals.firstPrints,
          reprints: seriesTotals.reprints,
          total: seriesTotals.total,
        },
      ],
      [
        { key: "label", label: LABEL_GROUP_LABEL[group] },
        { key: "firstPrints", label: t("platform.thFirstPrints") },
        { key: "reprints", label: t("platform.thReprints") },
        { key: "total", label: t("platform.thTotal") },
      ]
    );
    downloadCsv(`platform-labels-${from}-${to}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, {
      report: "platform_labels",
      from,
      to,
      group,
    });
  }

  const cards = [
    { label: t("platform.cardTenants"), value: tenants.length, sub: "" },
    { label: t("platform.cardUsers"), value: totals.users, sub: "" },
    { label: t("platform.cardBranches"), value: totals.branches, sub: "" },
    { label: t("platform.cardEpcTotal"), value: totals.epcTotal, sub: "" },
    { label: t("platform.cardLabels"), value: totals.labels, sub: t("platform.cardLabelsSub") },
  ];

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-400">{t("platform.desc")}</p>
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Нийлбэр картууд */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {cards.map((c) => (
          <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {loading ? "…" : c.value.toLocaleString()}
            </p>
            <p className="mt-0.5 text-xs text-slate-400">{loading ? "" : c.sub}</p>
          </div>
        ))}
      </div>

      {/* Компаниудын хүснэгт */}
      <div className="flex justify-end">
        <button
          onClick={exportTenants}
          disabled={tenants.length === 0}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("common.exportCsv")}
        </button>
      </div>
      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t("platform.thTenant")}</th>
              <th className={th}>{t("platform.thCreated")}</th>
              <th className={th + " text-right"}>{t("platform.thUsers")}</th>
              <th className={th + " text-right"}>{t("platform.thBranches")}</th>
              <th className={th + " text-right"}>{t("platform.thProducts")}</th>
              <th className={th + " text-right"}>{t("platform.thEpcTotal")}</th>
              <th className={th + " text-right"}>{t("platform.thEpcPrinted")}</th>
              <th className={th + " text-right"}>{t("platform.thLabels")}</th>
              <th className={th + " text-right"}>{t("platform.thActive")}</th>
              <th className={th + " text-right"}>{t("platform.thSold")}</th>
              <th className={th + " text-right"}>{t("platform.thTx")}</th>
              <th className={th}>{t("platform.thLastActivity")}</th>
              <th className={th}>{t("platform.thLastSignIn")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : tenants.length === 0 ? (
              <tr>
                <td colSpan={13} className="px-4 py-10 text-center text-slate-400">
                  {t("platform.noTenants")}
                </td>
              </tr>
            ) : (
              tenants.map((x) => (
                <tr key={x.tenant_id} className="hover:bg-slate-50">
                  <td className={td + " font-medium text-slate-900"}>{x.tenant_name}</td>
                  <td className={td + " whitespace-nowrap"}>{dt(x.created_at)}</td>
                  <td className={td + " text-right tabular-nums"}>{x.users.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.branches.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.products.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.epc_total.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.epc_printed.toLocaleString()}</td>
                  <td className={td + " text-right font-semibold tabular-nums"}>
                    {x.labels_printed.toLocaleString()}
                  </td>
                  <td className={td + " text-right tabular-nums"}>{x.epc_active.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.epc_sold.toLocaleString()}</td>
                  <td className={td + " text-right tabular-nums"}>{x.tx_count.toLocaleString()}</td>
                  <td className={td + " whitespace-nowrap"}>{dt(x.last_activity)}</td>
                  <td className={td + " whitespace-nowrap"}>{dt(x.last_sign_in)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Шошгоны хэрэглээ */}
      <p className="pt-2 text-sm font-semibold text-slate-700">{t("platform.labelsSection")}</p>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <label className="text-sm">
          <span className={lbl}>{t("platform.from")}</span>
          <input type="date" value={from} onChange={(e) => setRange(e.target.value, to)} className={ctl} />
        </label>
        <label className="text-sm">
          <span className={lbl}>{t("platform.to")}</span>
          <input type="date" value={to} onChange={(e) => setRange(from, e.target.value)} className={ctl} />
        </label>
        <div className="flex gap-1">
          <button
            onClick={() => setRange(daysAgo(30), isoDay(new Date()))}
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("platform.last30Days")}
          </button>
          <button
            onClick={() => setRange(monthsAgo(12), isoDay(new Date()))}
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("platform.last12Months")}
          </button>
          <button
            onClick={() => setRange(isoDay(new Date(new Date().getFullYear(), 0, 1)), isoDay(new Date()))}
            className="h-9 rounded-lg border border-slate-300 px-3 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("platform.thisYear")}
          </button>
        </div>
        <label className="text-sm">
          <span className={lbl}>{t("platform.groupBy")}</span>
          <select
            value={group}
            onChange={(e) => setGroup(e.target.value as LabelGroup)}
            className={ctl + " w-40"}
          >
            {(Object.keys(LABEL_GROUP_LABEL) as LabelGroup[]).map((g) => (
              <option key={g} value={g}>
                {LABEL_GROUP_LABEL[g]}
              </option>
            ))}
          </select>
        </label>
        <div className="flex-1" />
        <button
          onClick={exportLabels}
          disabled={grouped.length === 0}
          className="h-9 rounded-lg bg-emerald-600 px-3 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("common.exportCsv")}
        </button>
      </div>

      <div className="max-h-[55vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{LABEL_GROUP_LABEL[group]}</th>
              <th className={th + " text-right"}>{t("platform.thFirstPrints")}</th>
              <th className={th + " text-right"}>{t("platform.thReprints")}</th>
              <th className={th + " text-right"}>{t("platform.thTotal")}</th>
            </tr>
          </thead>
          <tbody>
            {seriesLoading ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {t("common.loading")}
                </td>
              </tr>
            ) : grouped.length === 0 ? (
              <tr>
                <td colSpan={4} className="px-4 py-10 text-center text-slate-400">
                  {t("platform.noLabels")}
                </td>
              </tr>
            ) : (
              <>
                {grouped.map((g) => (
                  <tr key={g.key} className="hover:bg-slate-50">
                    <td className={td + " max-w-[360px]"}>{g.label}</td>
                    <td className={td + " text-right tabular-nums"}>{g.firstPrints.toLocaleString()}</td>
                    <td className={td + " text-right tabular-nums"}>{g.reprints.toLocaleString()}</td>
                    <td className={td + " text-right font-semibold tabular-nums"}>
                      {g.total.toLocaleString()}
                    </td>
                  </tr>
                ))}
                <tr className="bg-slate-50 font-semibold">
                  <td className={td}>{t("platform.grandTotal")}</td>
                  <td className={td + " text-right tabular-nums"}>
                    {seriesTotals.firstPrints.toLocaleString()}
                  </td>
                  <td className={td + " text-right tabular-nums"}>
                    {seriesTotals.reprints.toLocaleString()}
                  </td>
                  <td className={td + " text-right tabular-nums"}>{seriesTotals.total.toLocaleString()}</td>
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">{t("platform.reprintFootnote")}</p>
    </div>
  );
}
