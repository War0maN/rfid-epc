import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { listBranches, type Branch } from "../lib/branches";
import { makeCan } from "../lib/permissions";
import { errorMessage } from "../lib/errorMessage";
import { normalizeEpc } from "../lib/epc";
import {
  listReceipts,
  createReceiptFromXlsx,
  submitScans,
  fetchProgress,
  fetchScanIssues,
  generateForRemainder,
  closeReceipt,
  type ReceiptListItem,
  type ProgressRow,
  type ScanIssue,
  type ScanCounts,
} from "../lib/receiving";

const ctl =
  "h-9 rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
const primaryBtn =
  "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

function isoToday(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  allowedBranches?: string[] | null; // null = хязгааргүй
  perms?: string[] | null; // null = бүрэн эрх
  refreshKey?: number;
}

/** Хүлээн авалт (Ү2) — таг-тай ирсэн барааг packing list-тэй тулгаж бүртгэнэ. */
export default function Receiving({ allowedBranches = null, perms = null }: Props) {
  const { t } = useTranslation();
  const can = makeCan(perms);
  const canAct = can("act_receiving");

  const [receipts, setReceipts] = useState<ReceiptListItem[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Сонгосон хүлээн авалт (дэлгэрэнгүй горим)
  const [current, setCurrent] = useState<ReceiptListItem | null>(null);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [issues, setIssues] = useState<ScanIssue[]>([]);
  const [showIssues, setShowIssues] = useState(false);
  const [scanValue, setScanValue] = useState("");
  const [lastResult, setLastResult] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const scanRef = useRef<HTMLInputElement>(null);

  // Шинээр үүсгэх форм
  const [showCreate, setShowCreate] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState("");
  const [arrival, setArrival] = useState(isoToday());
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [number, setNumber] = useState("");

  // Хаах модал: product_id -> үлдэгдэлд EPC үүсгэх эсэх
  const [closeModal, setCloseModal] = useState(false);
  const [genChecks, setGenChecks] = useState<Map<string, boolean>>(new Map());

  const visibleBranches = useMemo(
    () => (allowedBranches ? branches.filter((b) => allowedBranches.includes(b.id)) : branches),
    [branches, allowedBranches]
  );

  const reload = useCallback(() => {
    setLoading(true);
    Promise.all([listReceipts(), listBranches()])
      .then(([rs, brs]) => {
        setReceipts(rs);
        setBranches(brs);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let active = true;
    Promise.all([listReceipts(), listBranches()])
      .then(([rs, brs]) => {
        if (!active) return;
        setReceipts(rs);
        setBranches(brs);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  const loadDetail = useCallback((receiptId: string) => {
    Promise.all([fetchProgress(receiptId), fetchScanIssues(receiptId)])
      .then(([p, iss]) => {
        setProgress(p);
        setIssues(iss);
      })
      .catch((e) => setError(errorMessage(e)));
  }, []);

  function openDetail(r: ReceiptListItem) {
    setCurrent(r);
    setProgress([]);
    setIssues([]);
    setLastResult(null);
    setError(null);
    setInfo(null);
    loadDetail(r.id);
  }

  // ----- Үүсгэх -----
  async function handleCreate() {
    if (!file) {
      setError(t("receiving.fileRequired"));
      return;
    }
    if (!branchId) {
      setError(t("receiving.branchRequired"));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await createReceiptFromXlsx(supabase, file, {
        branchId,
        arrivalDate: arrival,
        supplier: supplier.trim() || undefined,
        note: note.trim() || undefined,
        number: number.trim() || undefined,
      });
      setInfo(
        t("receiving.createdInfo", {
          products: res.productCount,
          total: res.expectedTotal,
        }) + (res.skipped.length ? ` (${res.skipped[0]})` : "")
      );
      setShowCreate(false);
      setFile(null);
      setSupplier("");
      setNote("");
      setNumber("");
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  // ----- Скан -----
  async function handleScanSubmit() {
    if (!current) return;
    // Wedge нэг хех бичдэг; paste-аар олон мөр ч орж болно.
    const tokens = scanValue.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    const hexes: string[] = [];
    for (const tok of tokens) {
      try {
        hexes.push(normalizeEpc(tok));
      } catch {
        setLastResult(t("receiving.scanInvalid", { token: tok.slice(0, 30) }));
        return;
      }
    }
    setBusy(true);
    try {
      const counts = await submitScans(current.id, hexes);
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

  // ----- Хаах -----
  function openCloseModal() {
    const checks = new Map<string, boolean>();
    for (const p of progress) {
      const remainder = p.expected - p.scanned - p.generated;
      if (remainder > 0) checks.set(p.product_id, true);
    }
    setGenChecks(checks);
    setCloseModal(true);
  }

  async function handleClose() {
    if (!current) return;
    setBusy(true);
    setError(null);
    try {
      const toGenerate = progress
        .filter((p) => genChecks.get(p.product_id))
        .map((p) => ({ productId: p.product_id, count: p.expected - p.scanned - p.generated }))
        .filter((l) => l.count >= 1);
      let generated = 0;
      if (toGenerate.length > 0) {
        generated = await generateForRemainder(supabase, current.job_id, current.branch_id, toGenerate);
      }
      await closeReceipt(current.id);
      setCloseModal(false);
      setInfo(
        generated > 0
          ? t("receiving.closedWithGenerated", { n: generated })
          : t("receiving.closedInfo")
      );
      setCurrent({ ...current, status: "closed" });
      loadDetail(current.id);
      reload();
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
        (s, p) => ({
          expected: s.expected + p.expected,
          scanned: s.scanned + p.scanned,
          generated: s.generated + p.generated,
        }),
        { expected: 0, scanned: 0, generated: 0 }
      ),
    [progress]
  );

  // ============ Дэлгэрэнгүй горим ============
  if (current) {
    const remainderTotal = totals.expected - totals.scanned - totals.generated;
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => { setCurrent(null); reload(); }} className={btn}>
            ← {t("receiving.backToList")}
          </button>
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              {current.job_number}
              <span
                className={
                  "ml-2 rounded px-1.5 py-0.5 text-xs font-medium " +
                  (current.status === "open"
                    ? "bg-emerald-50 text-emerald-700"
                    : "bg-slate-100 text-slate-500")
                }
              >
                {current.status === "open" ? t("receiving.statusOpen") : t("receiving.statusClosed")}
              </span>
            </h2>
            <p className="text-sm text-slate-500">
              {current.branch_name} · {current.arrival_date}
              {current.supplier ? ` · ${current.supplier}` : ""}
            </p>
          </div>
          <div className="flex-1" />
          {current.status === "open" && canAct && (
            <button onClick={openCloseModal} disabled={busy} className={primaryBtn}>
              {t("receiving.closeBtn")}
            </button>
          )}
        </div>

        {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
        {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

        {/* Скан оролт (wedge: EPC + Enter; paste-аар олон мөр болно) */}
        {current.status === "open" && canAct && (
          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className={lbl}>{t("receiving.scanLabel")}</label>
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
                {t("receiving.scanBtn")}
              </button>
            </div>
            {lastResult && <p className="mt-2 text-xs text-slate-600">{lastResult}</p>}
          </div>
        )}

        {/* Явцын хүснэгт */}
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t("common.product")}</th>
                <th className={th}>SKU</th>
                <th className={th + " text-right"}>{t("receiving.colExpected")}</th>
                <th className={th + " text-right"}>{t("receiving.colScanned")}</th>
                <th className={th + " text-right"}>{t("receiving.colGenerated")}</th>
                <th className={th + " text-right"}>{t("receiving.colRemainder")}</th>
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
                    const rem = p.expected - p.scanned - p.generated;
                    return (
                      <tr key={p.product_id} className="hover:bg-slate-50">
                        <td className={td}>{p.name || p.gtin || "—"}</td>
                        <td className={td + " font-mono"}>{p.sku || "—"}</td>
                        <td className={td + " text-right tabular-nums"}>{p.expected}</td>
                        <td className={td + " text-right tabular-nums " + (p.scanned > 0 ? "text-emerald-700" : "")}>
                          {p.scanned}
                        </td>
                        <td className={td + " text-right tabular-nums"}>{p.generated}</td>
                        <td className={td + " text-right font-semibold tabular-nums " + (rem > 0 ? "text-amber-700" : "text-emerald-700")}>
                          {rem}
                        </td>
                      </tr>
                    );
                  })}
                  <tr className="bg-slate-50 font-semibold">
                    <td className={td}>{t("receiving.total")}</td>
                    <td className={td} />
                    <td className={td + " text-right tabular-nums"}>{totals.expected}</td>
                    <td className={td + " text-right tabular-nums"}>{totals.scanned}</td>
                    <td className={td + " text-right tabular-nums"}>{totals.generated}</td>
                    <td className={td + " text-right tabular-nums"}>{remainderTotal}</td>
                  </tr>
                </>
              )}
            </tbody>
          </table>
        </div>

        {/* Асуудалтай уншилтууд */}
        {issues.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50/40 p-4">
            <button
              onClick={() => setShowIssues((s) => !s)}
              className="text-sm font-medium text-amber-800"
            >
              {showIssues ? "▾" : "▸"} {t("receiving.issuesTitle", { n: issues.length })}
            </button>
            {showIssues && (
              <ul className="mt-2 space-y-1 text-xs text-slate-700">
                {issues.map((s) => (
                  <li key={s.epc_hex} className="font-mono">
                    {s.epc_hex}
                    <span className="ml-2 font-sans text-slate-500">
                      {t(`receiving.outcome.${s.outcome}`)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        {current.status === "closed" && totals.generated > 0 && (
          <p className="text-xs text-slate-400">{t("receiving.printHint", { job: current.job_number })}</p>
        )}

        {/* Хаах модал */}
        {closeModal && (
          <div
            className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
            onClick={() => setCloseModal(false)}
          >
            <div
              className="max-h-[80vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <h3 className="font-semibold text-slate-900">{t("receiving.closeTitle")}</h3>
              {remainderTotal > 0 ? (
                <>
                  <p className="mt-2 text-sm text-slate-600">
                    {t("receiving.closeBody", { n: remainderTotal })}
                  </p>
                  <div className="mt-3 space-y-1">
                    {progress
                      .filter((p) => p.expected - p.scanned - p.generated > 0)
                      .map((p) => (
                        <label
                          key={p.product_id}
                          className="flex cursor-pointer items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm"
                        >
                          <input
                            type="checkbox"
                            checked={genChecks.get(p.product_id) ?? false}
                            onChange={(e) =>
                              setGenChecks((m) => new Map(m).set(p.product_id, e.target.checked))
                            }
                          />
                          <span className="flex-1">{p.name || p.gtin || p.product_id}</span>
                          <span className="tabular-nums text-slate-500">
                            {p.expected - p.scanned - p.generated}
                          </span>
                        </label>
                      ))}
                  </div>
                  <p className="mt-2 text-xs text-slate-500">{t("receiving.closeHint")}</p>
                </>
              ) : (
                <p className="mt-2 text-sm text-slate-600">{t("receiving.closeAllScanned")}</p>
              )}
              <div className="mt-4 flex justify-end gap-2">
                <button onClick={() => setCloseModal(false)} className={btn}>
                  {t("common.cancel")}
                </button>
                <button onClick={handleClose} disabled={busy} className={primaryBtn}>
                  {busy ? t("receiving.closing") : t("receiving.closeConfirm")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ============ Жагсаалтын горим ============
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("receiving.title")}</h2>
          <p className="text-sm text-slate-500">{t("receiving.subtitle")}</p>
        </div>
        <div className="flex-1" />
        {canAct && (
          <button onClick={() => setShowCreate((s) => !s)} className={primaryBtn}>
            + {t("receiving.newBtn")}
          </button>
        )}
      </div>

      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}
      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {showCreate && (
        <div className="space-y-3 rounded-xl border border-indigo-200 bg-indigo-50/40 p-4">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className={lbl}>{t("receiving.fileLabel")}</label>
              <input
                type="file"
                accept=".xlsx"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                className="text-sm"
              />
            </div>
            <div>
              <label className={lbl}>{t("common.branch")}</label>
              <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={ctl + " w-full"}>
                <option value="">{t("receiving.branchSelect")}</option>
                {visibleBranches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={lbl}>{t("receiving.arrivalDate")}</label>
              <input type="date" value={arrival} onChange={(e) => setArrival(e.target.value)} className={ctl + " w-full"} />
            </div>
            <div>
              <label className={lbl}>{t("createJob.supplier")}</label>
              <input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder={t("createJob.supplierPlaceholder")}
                className={ctl + " w-full"}
              />
            </div>
            <div>
              <label className={lbl}>{t("receiving.numberLabel")}</label>
              <input
                value={number}
                onChange={(e) => setNumber(e.target.value)}
                placeholder={t("receiving.numberPlaceholder")}
                className={ctl + " w-full"}
              />
            </div>
            <div>
              <label className={lbl}>{t("common.note")}</label>
              <input value={note} onChange={(e) => setNote(e.target.value)} className={ctl + " w-full"} />
            </div>
          </div>
          <p className="text-xs text-slate-500">{t("receiving.createHint")}</p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setShowCreate(false)} className={btn}>
              {t("common.cancel")}
            </button>
            <button onClick={handleCreate} disabled={busy} className={primaryBtn}>
              {busy ? t("receiving.creating") : t("receiving.createBtn")}
            </button>
          </div>
        </div>
      )}

      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>{t("receiving.colNumber")}</th>
              <th className={th}>{t("common.date")}</th>
              <th className={th}>{t("common.branch")}</th>
              <th className={th}>{t("createJob.supplier")}</th>
              <th className={th}>{t("common.status")}</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t("common.loading")}</td></tr>
            ) : receipts.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-400">{t("receiving.empty")}</td></tr>
            ) : (
              receipts.map((r) => (
                <tr
                  key={r.id}
                  onClick={() => openDetail(r)}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className={td + " font-medium text-indigo-700"}>{r.job_number}</td>
                  <td className={td}>{r.arrival_date}</td>
                  <td className={td}>{r.branch_name}</td>
                  <td className={td}>{r.supplier || "—"}</td>
                  <td className={td}>
                    <span
                      className={
                        "rounded px-1.5 py-0.5 text-xs font-medium " +
                        (r.status === "open" ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500")
                      }
                    >
                      {r.status === "open" ? t("receiving.statusOpen") : t("receiving.statusClosed")}
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

/** Илгээлтийн үр дүнг нэг мөр тайлбар болгоно. */
function describeCounts(c: ScanCounts, t: (k: string, o?: Record<string, unknown>) => string): string {
  const parts: string[] = [];
  if (c.matched) parts.push(t("receiving.resMatched", { n: c.matched }));
  if (c.already_registered) parts.push(t("receiving.resAlready", { n: c.already_registered }));
  if (c.unknown_gtin) parts.push(t("receiving.resUnknown", { n: c.unknown_gtin }));
  if (c.not_on_list) parts.push(t("receiving.resNotOnList", { n: c.not_on_list }));
  if (c.undecodable) parts.push(t("receiving.resUndecodable", { n: c.undecodable }));
  if (c.serial_conflict) parts.push(t("receiving.resSerialConflict", { n: c.serial_conflict }));
  if (c.skipped) parts.push(t("receiving.resSkipped", { n: c.skipped }));
  return parts.length ? parts.join(" · ") : t("receiving.resNothing");
}
