import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBranches, type Branch } from "../lib/branches";
import { makeCan } from "../lib/permissions";
import { errorMessage } from "../lib/errorMessage";
import { normalizeEpc } from "../lib/epc";
import {
  listStocktakes,
  createStocktake,
  submitStocktakeScans,
  fetchStocktakeProgress,
  fetchStocktakeExtras,
  fetchMissing,
  closeStocktake,
  writeOffMissing,
  type StocktakeListItem,
  type StocktakeProgressRow,
  type StocktakeExtra,
  type StocktakeScanCounts,
  type MissingEpc,
} from "../lib/stocktake";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
const primaryBtn =
  "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

interface Props {
  isAdmin?: boolean;
  allowedBranches?: string[] | null;
  perms?: string[] | null;
}

/** Тооллого (Ү3) — салбарын Идэвхтэй EPC-г бодит байдалтай тулгана. */
export default function Stocktake({ isAdmin = false, allowedBranches = null, perms = null }: Props) {
  const { t } = useTranslation();
  const can = makeCan(perms);
  const canAct = can("act_stocktake");

  const [items, setItems] = useState<StocktakeListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  const [current, setCurrent] = useState<StocktakeListItem | null>(null);
  const [progress, setProgress] = useState<StocktakeProgressRow[]>([]);
  const [extras, setExtras] = useState<StocktakeExtra[]>([]);
  const [missing, setMissing] = useState<MissingEpc[]>([]);
  const [showExtras, setShowExtras] = useState(false);
  const [showMissing, setShowMissing] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  const [showCreate, setShowCreate] = useState(false);
  const [branchId, setBranchId] = useState("");
  const [note, setNote] = useState("");

  const visibleBranches = useMemo(
    () => (allowedBranches ? branches.filter((b) => allowedBranches.includes(b.id)) : branches),
    [branches, allowedBranches]
  );

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([listStocktakes(), listBranches()])
      .then(([sts, brs]) => {
        setItems(sts);
        setBranches(brs);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([listStocktakes(), listBranches()])
      .then(([sts, brs]) => {
        if (!active) return;
        setItems(sts);
        setBranches(brs);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const loadDetail = useCallback((id: string) => {
    Promise.all([fetchStocktakeProgress(id), fetchStocktakeExtras(id), fetchMissing(id)])
      .then(([p, ex, mi]) => {
        setProgress(p);
        setExtras(ex);
        setMissing(mi);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function openDetail(s: StocktakeListItem) {
    setCurrent(s);
    setProgress([]);
    setExtras([]);
    setMissing([]);
    setLastResult(null);
    setError(null);
    setInfo(null);
    loadDetail(s.id);
  }

  async function handleCreate() {
    if (!branchId) {
      setError(t("stocktake.branchRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createStocktake(branchId, note.trim() || undefined);
      setInfo(t("stocktake.createdInfo"));
      setShowCreate(false);
      setNote("");
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleScanSubmit() {
    if (!current) return;
    const tokens = scanValue.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    const hexes: string[] = [];
    for (const tok of tokens) {
      try {
        hexes.push(normalizeEpc(tok));
      } catch {
        setLastResult(t("stocktake.scanInvalid", { token: tok.slice(0, 30) }));
        return;
      }
    }
    setBusy(true);
    try {
      const counts = await submitStocktakeScans(current.id, hexes);
      setScanValue("");
      setLastResult(describeCounts(counts, t));
      loadDetail(current.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
      scanRef.current?.focus();
    }
  }

  async function handleClose() {
    if (!current) return;
    if (!window.confirm(t("stocktake.closeConfirmText"))) return;
    setBusy(true);
    setError(null);
    try {
      await closeStocktake(current.id);
      setCurrent({ ...current, status: "closed" });
      setInfo(t("stocktake.closedInfo"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleWriteOff() {
    if (!current || missing.length === 0) return;
    if (!window.confirm(t("stocktake.writeOffConfirm", { n: missing.length }))) return;
    setBusy(true);
    setError(null);
    try {
      const n = await writeOffMissing(
        missing.map((m) => m.epc_id),
        t("stocktake.writeOffReason", { number: current.number })
      );
      setInfo(t("stocktake.writeOffDone", { n }));
      loadDetail(current.id);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const th =
    "border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
  const td = "border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0";

  const totals = useMemo(
    () =>
      progress.reduce(
        (s, p) => ({ expected: s.expected + p.expected, found: s.found + p.found }),
        { expected: 0, found: 0 }
      ),
    [progress]
  );

  const productName = useCallback(
    (id: string | null) => progress.find((p) => p.product_id === id)?.name ?? null,
    [progress]
  );

  // ============ Дэлгэрэнгүй ============
  if (current) {
    const missingTotal = totals.expected - totals.found;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setCurrent(null); reload(); }} className={btn}>
            ← {t("stocktake.backToList")}
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {current.number}
              <span
                className={
                  "ml-2 rounded px-1.5 py-0.5 text-xs font-medium " +
                  (current.status === "open"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500")
                }
              >
                {current.status === "open" ? t("stocktake.statusOpen") : t("stocktake.statusClosed")}
              </span>
            </h2>
            <p className="text-sm text-slate-500">
              {current.branch_name} · {current.created_at.slice(0, 10)}
              {current.note ? ` · ${current.note}` : ""}
            </p>
          </div>
          <div className="flex-1" />
          {current.status === "open" && canAct && (
            <button onClick={handleClose} disabled={busy} className={primaryBtn}>
              {t("stocktake.closeBtn")}
            </button>
          )}
        </div>

        {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Нийлбэр картууд */}
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: t("stocktake.cardExpected"), value: totals.expected, cls: "text-slate-900" },
            { label: t("stocktake.cardFound"), value: totals.found, cls: "text-emerald-700" },
            { label: t("stocktake.cardMissing"), value: missingTotal, cls: missingTotal > 0 ? "text-amber-700" : "text-emerald-700" },
          ].map((c) => (
            <div key={c.label} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{c.label}</p>
              <p className={"mt-1 text-2xl font-semibold tabular-nums " + c.cls}>{c.value.toLocaleString()}</p>
            </div>
          ))}
        </div>

        {/* Скан оролт */}
        {current.status === "open" && canAct && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className={lbl}>{t("stocktake.scanLabel")}</label>
            <div className="flex gap-2">
              <input
                ref={scanRef}
                autoFocus
                value={scanValue}
                onChange={(e) => setScanValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleScanSubmit()}
                placeholder="3034F85710507F8000000006"
                className={ctl + " flex-1 font-mono"}
              />
              <button onClick={handleScanSubmit} disabled={busy || !scanValue.trim()} className={primaryBtn}>
                {t("stocktake.scanBtn")}
              </button>
            </div>
            {lastResult && <p className="mt-2 text-xs text-slate-600">{lastResult}</p>}
          </div>
        )}

        {/* Явц — бараагаар */}
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t("common.product")}</th>
                <th className={th}>SKU</th>
                <th className={th + " text-right"}>{t("stocktake.colExpected")}</th>
                <th className={th + " text-right"}>{t("stocktake.colFound")}</th>
                <th className={th + " text-right"}>{t("stocktake.colMissing")}</th>
              </tr>
            </thead>
            <tbody>
              {progress.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-slate-400">
                    {t("common.loading")}
                  </td>
                </tr>
              ) : (
                <>
                  {progress.map((p) => {
                    const miss = p.expected - p.found;
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50">
                        <td className={td}>{p.name || "—"}</td>
                        <td className={td + " font-mono"}>{p.sku || "—"}</td>
                        <td className={td + " text-right tabular-nums"}>{p.expected}</td>
                        <td className={td + " text-right tabular-nums " + (p.found > 0 ? "text-emerald-700" : "")}>
                          {p.found}
                        </td>
                        <td className={td + " text-right font-semibold tabular-nums " + (miss > 0 ? "text-amber-700" : "text-emerald-700")}>
                          {miss}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className={td}>{t("stocktake.total")}</td>
                    <td className={td} />
                    <td className={td + " text-right tabular-nums"}>{totals.expected}</td>
                    <td className={td + " text-right tabular-nums"}>{totals.found}</td>
                    <td className={td + " text-right tabular-nums"}>{missingTotal}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Дутуу жагсаалт + актлах */}
        {missing.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowMissing((s) => !s)}
                className="text-sm font-medium text-amber-800"
              >
                {showMissing ? "▾" : "▸"} {t("stocktake.missingTitle", { n: missing.length })}
              </button>
              <div className="flex-1" />
              {current.status === "closed" && isAdmin && (
                <button onClick={handleWriteOff} disabled={busy} className={btn + " border-amber-300 text-amber-800"}>
                  {t("stocktake.writeOffBtn", { n: missing.length })}
                </button>
              )}
            </div>
            {current.status === "closed" && isAdmin && (
              <p className="mt-1 text-xs text-amber-700">{t("stocktake.writeOffHint")}</p>
            )}
            {showMissing && (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-700">
                {missing.map((m) => (
                  <li key={m.epc_id} className="font-mono">
                    {m.epc_hex}
                    <span className="ml-2 font-sans text-slate-500">{productName(m.product_id) ?? ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {/* Илүү олдсон / танигдаагүй */}
        {extras.length > 0 && (
          <div className="rounded-xl border border-sky-200 bg-sky-50/40 p-4">
            <button onClick={() => setShowExtras((s) => !s)} className="text-sm font-medium text-sky-800">
              {showExtras ? "▾" : "▸"} {t("stocktake.extrasTitle", { n: extras.length })}
            </button>
            {showExtras && (
              <ul className="mt-2 max-h-64 space-y-1 overflow-y-auto text-xs text-slate-700">
                {extras.map((s) => (
                  <li key={s.epc_hex} className="font-mono">
                    {s.epc_hex}
                    <span className="ml-2 font-sans text-slate-500">
                      {t(`stocktake.outcome.${s.outcome}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    );
  }

  // ============ Жагсаалт ============
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("stocktake.title")}</h2>
          <p className="text-sm text-slate-500">{t("stocktake.subtitle")}</p>
        </div>
        <div className="flex-1" />
        {canAct && (
          <button onClick={() => setShowCreate((s) => !s)} className={primaryBtn}>
            + {t("stocktake.newBtn")}
          </button>
        )}
      </div>

      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showCreate && (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className={lbl}>{t("common.branch")}</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ctl + " w-full"}>
                <option value="">{t("stocktake.branchSelect")}</option>
                {visibleBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>{t("common.note")}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={ctl + " w-full"} />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("stocktake.createHint")}</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className={btn}>
              {t("common.cancel")}
            </button>
            <button onClick={handleCreate} disabled={busy} className={primaryBtn}>
              {busy ? t("stocktake.creating") : t("stocktake.createBtn")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t("stocktake.colNumber")}</th>
              <th className={th}>{t("common.date")}</th>
              <th className={th}>{t("common.branch")}</th>
              <th className={th}>{t("common.note")}</th>
              <th className={th}>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : items.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t("stocktake.empty")}</td></tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} onClick={() => openDetail(s)} className="cursor-pointer hover:bg-slate-50">
                  <td className={td + " font-medium text-indigo-700"}>{s.number}</td>
                  <td className={td}>{s.created_at.slice(0, 10)}</td>
                  <td className={td}>{s.branch_name}</td>
                  <td className={td}>{s.note || "—"}</td>
                  <td className={td}>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs font-medium " +
                        (s.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {s.status === "open" ? t("stocktake.statusOpen") : t("stocktake.statusClosed")}
                    </span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function describeCounts(
  c: StocktakeScanCounts,
  t: (k: string, o?: Record<string, unknown>) => string
): string {
  const parts: string[] = [];
  if (c.found) parts.push(t("stocktake.resFound", { n: c.found }));
  if (c.not_expected) parts.push(t("stocktake.resNotExpected", { n: c.not_expected }));
  if (c.unknown) parts.push(t("stocktake.resUnknown", { n: c.unknown }));
  if (c.skipped) parts.push(t("stocktake.resSkipped", { n: c.skipped }));
  return parts.length ? parts.join(" · ") : t("stocktake.resNothing");
}
