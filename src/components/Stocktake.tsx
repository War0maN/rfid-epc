import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBranches, type Branch } from "../lib/branches";
import { makeCan } from "../lib/permissions";
import { errorMessage } from "../lib/errorMessage";
import { normalizeEpc } from "../lib/epc";
import { STATUS_LABEL, badgeOf } from "../lib/epcStatus";
import ConfirmDialog from "./ConfirmDialog";
import { supabase } from "../lib/supabaseClient";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { logAuditEvent } from "../lib/audit";
import {
  listStocktakes,
  createStocktake,
  submitStocktakeScans,
  fetchStocktakeProgress,
  fetchStocktakeExtras,
  fetchMissing,
  closeStocktake,
  writeOffMissing,
  absorbExtras,
  type StocktakeListItem,
  type StocktakeProgressRow,
  type StocktakeExtraDetail,
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
  const [extras, setExtras] = useState<StocktakeExtraDetail[]>([]);
  const [missing, setMissing] = useState<MissingEpc[]>([]);
  // Дутуу/Илүү картын тоон дээр дарахад нээгдэх дэлгэрэнгүй модал
  const [detailModal, setDetailModal] = useState<"missing" | "extras" | null>(null);
  // Актлах сонголт (epc_id) + заавал бичих тайлбар
  const [woChecked, setWoChecked] = useState<Set<string>>(new Set());
  const [woReason, setWoReason] = useState("");
  // Илүүг энэ салбарт бүртгэх сонголт (epc_id)
  const [abChecked, setAbChecked] = useState<Set<string>>(new Set());
  // Баталгаажуулах модал (window.confirm найдваргүй — ConfirmDialog ашиглана)
  const [confirmDlg, setConfirmDlg] = useState<{
    message: string;
    action: () => void;
    danger?: boolean;
  } | null>(null);
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
    setAbChecked(new Set());
    setDetailModal(null);
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
    // Нэг салбарт нэг л нээлттэй тооллого — DB ч хориглоно, энд найрсаг сануулна.
    const openSame = items.find((s) => s.branch_id === branchId && s.status === "open");
    if (openSame) {
      setError(t("stocktake.openExists", { number: openSame.number }));
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

  function handleClose() {
    if (!current) return;
    const cur = current;
    setConfirmDlg({
      message: t("stocktake.closeConfirmText"),
      action: async () => {
        setBusy(true);
        setError(null);
        try {
          await closeStocktake(cur.id);
          setCurrent({ ...cur, status: "closed" });
          setInfo(t("stocktake.closedInfo"));
          reload();
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function handleWriteOff() {
    if (!current) return;
    const cur = current;
    const ids = missing.filter((m) => woChecked.has(m.epc_id)).map((m) => m.epc_id);
    const reason = woReason.trim();
    if (ids.length === 0 || !reason) return; // товч ч идэвхгүй байдаг
    setConfirmDlg({
      message: t("stocktake.writeOffConfirm", { n: ids.length }),
      danger: true,
      action: async () => {
        setBusy(true);
        setError(null);
        try {
          // Түүхэнд: "Тооллого ST-0001: <хэрэглэгчийн тайлбар>"
          const n = await writeOffMissing(
            ids,
            `${t("stocktake.writeOffPrefix", { number: cur.number })}: ${reason}`
          );
          setInfo(t("stocktake.writeOffDone", { n }));
          setDetailModal(null);
          setWoReason("");
          loadDetail(cur.id);
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  // ----- CSV татах (түүхий утгууд — Excel-д танигдана) -----
  function exportProgress() {
    if (!current) return;
    const csv = toCsv(
      progress.map((p) => ({
        name: p.name ?? "",
        sku: p.sku ?? "",
        barcode: p.gtin ?? "",
        expected: p.expected,
        found: p.found,
        missing: p.expected - p.found,
      })),
      [
        { key: "name", label: t("common.product") },
        { key: "sku", label: "SKU" },
        { key: "barcode", label: t("common.barcode") },
        { key: "expected", label: t("stocktake.colExpected") },
        { key: "found", label: t("stocktake.colFound") },
        { key: "missing", label: t("stocktake.colMissing") },
      ]
    );
    downloadCsv(`stocktake-${current.number}.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, {
      report: "stocktake",
      number: current.number,
    });
  }

  function exportMissing() {
    if (!current) return;
    const csv = toCsv(
      missing.map((m) => {
        const p = productInfo.get(m.product_id);
        return {
          name: p?.name ?? "",
          sku: p?.sku ?? "",
          barcode: p?.gtin ?? "",
          epc: m.epc_hex,
        };
      }),
      [
        { key: "name", label: t("common.product") },
        { key: "sku", label: "SKU" },
        { key: "barcode", label: t("common.barcode") },
        { key: "epc", label: "EPC" },
      ]
    );
    downloadCsv(`stocktake-${current.number}-missing.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, {
      report: "stocktake_missing",
      number: current.number,
    });
  }

  /** Сонгосон илүү тагийг энэ салбарт Идэвхтэй болгож, Тоологдсонд оруулна. */
  function handleAbsorb() {
    if (!current || abChecked.size === 0) return;
    setConfirmDlg({
      message: t("stocktake.absorbConfirm", { n: abChecked.size, branch: current.branch_name }),
      action: async () => {
        setBusy(true);
        setError(null);
        try {
          const r = await absorbExtras(current.id, [...abChecked]);
          setInfo(
            t("stocktake.absorbDone", { done: r.done }) +
              (r.skipped > 0 ? " · " + t("stocktake.absorbSkipped", { n: r.skipped }) : "")
          );
          setAbChecked(new Set());
          setDetailModal(null);
          loadDetail(current.id);
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      },
    });
  }

  function exportExtras() {
    if (!current) return;
    const csv = toCsv(
      extras.map((s) => ({
        name: s.name ?? "",
        sku: s.sku ?? "",
        barcode: s.gtin ?? "",
        epc: s.epc_hex,
        status: s.status ? (STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status) : "",
        branch: s.status ? branchName(s.branch_id) : "",
      })),
      [
        { key: "name", label: t("common.product") },
        { key: "sku", label: "SKU" },
        { key: "barcode", label: t("common.barcode") },
        { key: "epc", label: "EPC" },
        { key: "status", label: t("common.status") },
        { key: "branch", label: t("common.branch") },
      ]
    );
    downloadCsv(`stocktake-${current.number}-extra.csv`, csv);
    void logAuditEvent(supabase, "export_csv", "report", null, {
      report: "stocktake_extra",
      number: current.number,
    });
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

  // Дутуу жагсаалтын бараа мэдээлэл — snapshot-ын бүх бараа progress-д бий.
  // (Жижиг тул memo хэрэггүй — React Compiler өөрөө оновчилно.)
  const productInfo = new Map(progress.map((p) => [p.product_id, p]));
  const branchName = (id: string | null) => branches.find((b) => b.id === id)?.name ?? "—";

  // ============ Дэлгэрэнгүй ============
  if (current) {
    const missingTotal = totals.expected - totals.found;
    const canWriteOff = current.status === "closed" && isAdmin;
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
          <button onClick={exportProgress} disabled={progress.length === 0} className={btn}>
            {t("common.exportCsv")}
          </button>
          {current.status === "open" && canAct && (
            <button onClick={handleClose} disabled={busy} className={primaryBtn}>
              {t("stocktake.closeBtn")}
            </button>
          )}
        </div>

        {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Нийлбэр картууд — Дутуу/Илүүгийн тоон дээр дарж дэлгэрэнгүй харна */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("stocktake.cardFoundExpected")}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              <span className={totals.found === totals.expected ? "text-emerald-700" : ""}>
                {totals.found.toLocaleString()}
              </span>
              <span className="text-slate-400">/{totals.expected.toLocaleString()}</span>
            </p>
          </div>
          <button
            onClick={() => {
              if (missingTotal === 0) return;
              // Актлах сонголт: анхдагчаар бүгд чеклэгдсэн, тайлбар хоосон.
              setWoChecked(new Set(missing.map((m) => m.epc_id)));
              setWoReason("");
              setDetailModal("missing");
            }}
            disabled={missingTotal === 0}
            className={
              "rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm " +
              (missingTotal > 0 ? "cursor-pointer hover:border-amber-300 hover:bg-amber-50/40" : "")
            }
            title={missingTotal > 0 ? t("stocktake.clickForDetail") : undefined}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("stocktake.cardMissing")}
            </p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + (missingTotal > 0 ? "text-amber-700 underline decoration-dotted underline-offset-4" : "text-emerald-700")}>
              {missingTotal.toLocaleString()}
            </p>
          </button>
          <button
            onClick={() => extras.length > 0 && setDetailModal("extras")}
            disabled={extras.length === 0}
            className={
              "rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm " +
              (extras.length > 0 ? "cursor-pointer hover:border-sky-300 hover:bg-sky-50/40" : "")
            }
            title={extras.length > 0 ? t("stocktake.clickForDetail") : undefined}
          >
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              {t("stocktake.cardExtra")}
            </p>
            <p className={"mt-1 text-2xl font-semibold tabular-nums " + (extras.length > 0 ? "text-sky-700 underline decoration-dotted underline-offset-4" : "text-slate-900")}>
              {extras.length.toLocaleString()}
            </p>
          </button>
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
                <th className={th}>{t("common.barcode")}</th>
                <th className={th + " text-right"}>{t("stocktake.colExpected")}</th>
                <th className={th + " text-right"}>{t("stocktake.colFound")}</th>
                <th className={th + " text-right"}>{t("stocktake.colMissing")}</th>
              </tr>
            </thead>
            <tbody>
              {progress.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
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
                        <td className={td + " font-mono"}>{p.gtin || "—"}</td>
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

        {/* Дутуугийн дэлгэрэнгүй модал */}
        {detailModal === "missing" && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setDetailModal(null)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-slate-900">
                {t("stocktake.missingTitle", { n: missing.length })}
              </h3>
              <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      {canWriteOff && (
                        <th className={th + " w-8"}>
                          <input
                            type="checkbox"
                            checked={woChecked.size === missing.length && missing.length > 0}
                            onChange={(e) =>
                              setWoChecked(
                                e.target.checked ? new Set(missing.map((m) => m.epc_id)) : new Set()
                              )
                            }
                          />
                        </th>
                      )}
                      <th className={th}>{t("common.product")}</th>
                      <th className={th}>SKU</th>
                      <th className={th}>{t("common.barcode")}</th>
                      <th className={th}>EPC</th>
                    </tr>
                  </thead>
                  <tbody>
                    {missing.map((m) => {
                      const p = productInfo.get(m.product_id);
                      return (
                        <tr key={m.epc_id} className="hover:bg-slate-50">
                          {canWriteOff && (
                            <td className={td}>
                              <input
                                type="checkbox"
                                checked={woChecked.has(m.epc_id)}
                                onChange={(e) =>
                                  setWoChecked((s) => {
                                    const n = new Set(s);
                                    if (e.target.checked) n.add(m.epc_id);
                                    else n.delete(m.epc_id);
                                    return n;
                                  })
                                }
                              />
                            </td>
                          )}
                          <td className={td}>{p?.name || "—"}</td>
                          <td className={td + " font-mono"}>{p?.sku || "—"}</td>
                          <td className={td + " font-mono"}>{p?.gtin || "—"}</td>
                          <td className={td + " font-mono"}>{m.epc_hex}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canWriteOff && (
                <div className="mt-3">
                  <label className={lbl}>{t("stocktake.writeOffReasonLabel")}</label>
                  <input
                    value={woReason}
                    onChange={(e) => setWoReason(e.target.value)}
                    placeholder={t("stocktake.writeOffReasonPlaceholder")}
                    className={ctl + " w-full"}
                  />
                  <p className="mt-1 text-xs text-amber-700">{t("stocktake.writeOffHint")}</p>
                </div>
              )}
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                <button onClick={exportMissing} className={btn}>
                  {t("common.exportCsv")}
                </button>
                <button onClick={() => setDetailModal(null)} className={btn}>
                  {t("common.close")}
                </button>
                {canWriteOff && (
                  <button
                    onClick={handleWriteOff}
                    disabled={busy || woChecked.size === 0 || !woReason.trim()}
                    className="rounded-lg bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-50"
                  >
                    {t("stocktake.writeOffBtn", { n: woChecked.size })}
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Илүүгийн дэлгэрэнгүй модал — төлөв нь ЯАГААД илүү болохыг тайлбарлана */}
        {detailModal === "extras" && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setDetailModal(null)}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-3xl flex-col rounded-xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-slate-900">
                {t("stocktake.extrasTitle", { n: extras.length })}
              </h3>
              <p className="mt-1 text-xs text-slate-500">{t("stocktake.extrasScanTimeHint")}</p>
              {(() => {
                // Нээлттэй тооллогод: Идэвхтэй/Хэвлээгүй тагийг сонгож энэ салбарт бүртгэж болно.
                const absorbMode = current.status === "open" && (isAdmin || canAct);
                const eligible = extras.filter(
                  (s) => s.epc_id && (s.current_status === "active" || s.current_status === "unprinted")
                );
                const allChecked = eligible.length > 0 && eligible.every((s) => abChecked.has(s.epc_id as string));
                return (
                  <>
                    <div className="mt-3 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr>
                            {absorbMode && (
                              <th className={th + " w-8"}>
                                <input
                                  type="checkbox"
                                  checked={allChecked}
                                  disabled={eligible.length === 0}
                                  onChange={(e) =>
                                    setAbChecked(
                                      e.target.checked
                                        ? new Set(eligible.map((s) => s.epc_id as string))
                                        : new Set()
                                    )
                                  }
                                />
                              </th>
                            )}
                            <th className={th}>{t("common.product")}</th>
                            <th className={th}>SKU</th>
                            <th className={th}>{t("common.barcode")}</th>
                            <th className={th}>EPC</th>
                            <th className={th}>{t("common.status")}</th>
                            <th className={th}>{t("common.branch")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {extras.map((s) => {
                            const canPick =
                              absorbMode &&
                              !!s.epc_id &&
                              (s.current_status === "active" || s.current_status === "unprinted");
                            return (
                              <tr key={s.epc_hex} className="hover:bg-slate-50">
                                {absorbMode && (
                                  <td className={td}>
                                    <input
                                      type="checkbox"
                                      checked={!!s.epc_id && abChecked.has(s.epc_id)}
                                      disabled={!canPick}
                                      onChange={(e) =>
                                        setAbChecked((c) => {
                                          const n = new Set(c);
                                          if (e.target.checked) n.add(s.epc_id as string);
                                          else n.delete(s.epc_id as string);
                                          return n;
                                        })
                                      }
                                    />
                                  </td>
                                )}
                                <td className={td}>{s.name || "—"}</td>
                                <td className={td + " font-mono"}>{s.sku || "—"}</td>
                                <td className={td + " font-mono"}>{s.gtin || "—"}</td>
                                <td className={td + " font-mono"}>{s.epc_hex}</td>
                                <td className={td}>
                                  {s.status ? (
                                    <span className={"whitespace-nowrap rounded px-1.5 py-0.5 text-xs font-medium " + badgeOf(s.status)}>
                                      {STATUS_LABEL[s.status as keyof typeof STATUS_LABEL] ?? s.status}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                                <td className={td}>{s.status ? branchName(s.branch_id) : "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 flex flex-wrap justify-end gap-2">
                      {absorbMode && (
                        <button
                          onClick={handleAbsorb}
                          disabled={busy || abChecked.size === 0}
                          className={primaryBtn}
                        >
                          {t("stocktake.absorbButton", { n: abChecked.size })}
                        </button>
                      )}
                      <button onClick={exportExtras} className={btn}>
                        {t("common.exportCsv")}
                      </button>
                      <button onClick={() => setDetailModal(null)} className={btn}>
                        {t("common.close")}
                      </button>
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        )}

        {confirmDlg && (
          <ConfirmDialog
            message={confirmDlg.message}
            danger={confirmDlg.danger}
            busy={busy}
            onCancel={() => setConfirmDlg(null)}
            onConfirm={() => {
              const a = confirmDlg.action;
              setConfirmDlg(null);
              a();
            }}
          />
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
  // unknown (системд бүртгэлгүй таг) зориуд дурдагдахгүй — хэрэггүй мэдээлэл.
  if (c.skipped) parts.push(t("stocktake.resSkipped", { n: c.skipped }));
  return parts.length ? parts.join(" · ") : t("stocktake.resNothing");
}
