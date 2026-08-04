import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBranches, type Branch } from "../lib/branches";
import { listProducts, type ProductRow } from "../lib/products";
import { fetchStockByBranch, type StockCell } from "../lib/inventory";
import {
  cancelDraft,
  createDraftJob,
  listOpenDrafts,
  DRAFT_TYPE_LABEL,
  type DraftRow,
} from "../lib/txDrafts";
import { parseJobLinesFile } from "../lib/importJobLines";
import { errorMessage } from "../lib/errorMessage";
import { makeCan } from "../lib/permissions";
import ConfirmDialog from "./ConfirmDialog";

const ctl =
  "h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";
const btn = "rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50";
const primaryBtn =
  "rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50";

interface Props {
  allowedBranches?: string[] | null;
  perms?: string[] | null;
}

/**
 * Шилжүүлгийн даалгавар (Шат 2) — нээлттэй бүх ноорог (вебийн даалгавар +
 * уншигчийн чөлөөт сагс) нэг дор, явцтай нь. Даалгавар үүсгэх: эх/очих
 * салбар + барааны жагсаалт (үлдэгдлээс сонгох эсвэл бүх бараанаас хайх).
 * Гүйцэтгэл нь уншигч дээр; илгээгдмэгц ердийн TRF гүйлгээ болно.
 */
export default function TransferJobs({ allowedBranches = null, perms = null }: Props) {
  const { t } = useTranslation();
  const can = makeCan(perms);

  const [drafts, setDrafts] = useState<DraftRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [stock, setStock] = useState<StockCell[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [cancelId, setCancelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Үүсгэх модал
  const [showCreate, setShowCreate] = useState(false);
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Map<string, number>>(new Map());
  const [filter, setFilter] = useState("");
  // Жагсаалт бүрдүүлэх эх үүсвэр: үлдэгдлээс (default) / бүх бараанаас
  const [source, setSource] = useState<"stock" | "all">("stock");
  // Excel импортын үр дүнгийн мэдээлэл/анхааруулга
  const [importInfo, setImportInfo] = useState<string | null>(null);
  const [importWarn, setImportWarn] = useState<string[] | null>(null);

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);
  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);
  /** Эх салбарын идэвхтэй үлдэгдэл: product_id → тоо. */
  const stockOfFrom = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of stock) if (c.branch_id === fromBranch) m.set(c.product_id, c.qty);
    return m;
  }, [stock, fromBranch]);

  const fromOptions = useMemo(
    () => (allowedBranches ? branches.filter((b) => allowedBranches.includes(b.id)) : branches),
    [branches, allowedBranches]
  );

  function reload() {
    setLoading(true);
    Promise.all([listOpenDrafts(), listBranches()])
      .then(([ds, brs]) => {
        setDrafts(ds);
        setBranches(brs);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    Promise.all([listOpenDrafts(), listBranches()])
      .then(([ds, brs]) => {
        if (!active) return;
        setDrafts(ds);
        setBranches(brs);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, []);

  function openCreate() {
    setShowCreate(true);
    setFromBranch("");
    setToBranch("");
    setNote("");
    setLines(new Map());
    setFilter("");
    setSource("stock");
    setInfo(null);
    setImportInfo(null);
    setImportWarn(null);
    // Бараа/үлдэгдлийг модал нээхэд нэг удаа татна (дараа нь кэштэй).
    if (products.length === 0) {
      listProducts().then(setProducts).catch((e) => setError(errorMessage(e)));
    }
    if (stock.length === 0) {
      fetchStockByBranch().then(setStock).catch((e) => setError(errorMessage(e)));
    }
  }

  function setQty(productId: string, qty: number, max?: number) {
    setLines((m) => {
      const n = new Map(m);
      const capped = max != null ? Math.min(qty, max) : qty;
      if (capped <= 0) n.delete(productId);
      else n.set(productId, capped);
      return n;
    });
  }

  async function handleCreate() {
    if (!fromBranch || !toBranch || lines.size === 0) return;
    setBusy(true);
    setError(null);
    try {
      await createDraftJob({
        fromBranch,
        toBranch,
        note: note.trim() || null,
        lines: [...lines.entries()].map(([product_id, qty]) => ({ product_id, qty })),
      });
      setShowCreate(false);
      setInfo(t("transactions.drafts.created"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    if (!cancelId) return;
    setBusy(true);
    setError(null);
    try {
      await cancelDraft(cancelId);
      setCancelId(null);
      setInfo(t("transactions.drafts.cancelled"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /** Excel-ээс жагсаалт нэмэх: байгаа бараатай л тулгана (шинэ бараа ҮҮСГЭХГҮЙ). */
  async function handleExcel(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // ижил файлыг дахин сонгоход ч change ажиллана
    if (!file) return;
    setError(null);
    setImportInfo(null);
    setImportWarn(null);
    try {
      const res = await parseJobLinesFile(file, products);
      if (res.lines.length > 0) {
        setLines((m) => {
          const n = new Map(m);
          for (const l of res.lines) n.set(l.product_id, (n.get(l.product_id) ?? 0) + l.qty);
          return n;
        });
        // Импортолсон бараа эх салбарт үлдэгдэлгүй байсан ч харагдахын тулд
        // "Бүх бараанаас" харагдац руу шилжинэ.
        setSource("all");
      }
      setImportInfo(
        t("transactions.drafts.excelDone", { products: res.lines.length, qty: res.totalQty })
      );
      const warns = [...res.unmatched, ...res.skipped];
      if (warns.length > 0) {
        setImportWarn(
          warns.slice(0, 5).concat(warns.length > 5 ? [`… +${warns.length - 5}`] : [])
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  /** Модалын барааны жагсаалт: үлдэгдлээс (эх салбарынх) эсвэл бүгдээс, шүүлттэй. */
  const pickerRows = useMemo(() => {
    const f = filter.trim().toLowerCase();
    const match = (p: ProductRow) =>
      !f ||
      (p.name ?? "").toLowerCase().includes(f) ||
      (p.sku ?? "").toLowerCase().includes(f) ||
      (p.gtin ?? "").includes(f);
    if (source === "stock") {
      return [...stockOfFrom.entries()]
        .map(([pid, qty]) => ({ p: productMap.get(pid), avail: qty }))
        .filter((r): r is { p: ProductRow; avail: number } => !!r.p && match(r.p))
        .sort((a, b) => (a.p.name ?? "").localeCompare(b.p.name ?? ""));
    }
    return products
      .filter(match)
      .slice(0, 200)
      .map((p) => ({ p, avail: stockOfFrom.get(p.id) ?? 0 }));
  }, [source, stockOfFrom, products, productMap, filter]);

  const totalPlanned = [...lines.values()].reduce((s, q) => s + q, 0);

  const th =
    "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-3 py-2 text-sm text-slate-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-slate-500">{t("transactions.drafts.subtitle")}</p>
        <div className="flex-1" />
        <button onClick={reload} className={btn}>
          ↻ {t("transactions.refresh")}
        </button>
        {can("act_transfer") && (
          <button onClick={openCreate} className={primaryBtn}>
            + {t("transactions.drafts.newJob")}
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      {loading ? (
        <p className="py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>
      ) : drafts.length === 0 ? (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-400">
          {t("transactions.drafts.empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {drafts.map((d) => {
            const planned = d.lines.reduce((s, l) => s + l.expected, 0);
            const picked = d.lines.reduce((s, l) => s + l.picked, 0);
            const isJob = d.lines.length > 0;
            return (
              <div key={d.id} className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <button
                  className="flex w-full flex-wrap items-center gap-2 px-4 py-3 text-left"
                  onClick={() => setExpanded(expanded === d.id ? null : d.id)}
                >
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {DRAFT_TYPE_LABEL[d.type]}
                  </span>
                  <span className="text-sm font-medium text-slate-800">
                    {d.from_branch ? (branchName.get(d.from_branch) ?? "?") : t("transactions.drafts.noFrom")}
                    {d.type === "transfer" && (
                      <> → {d.to_branch ? (branchName.get(d.to_branch) ?? "?") : "—"}</>
                    )}
                  </span>
                  <span className="text-xs text-slate-400">
                    {d.created_at.slice(0, 10)} · {d.created_by_email ?? "—"}
                  </span>
                  <span className="flex-1" />
                  {isJob ? (
                    <span
                      className={
                        "rounded px-2 py-0.5 text-xs font-medium " +
                        (picked >= planned ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-600")
                      }
                    >
                      {picked}/{planned}
                    </span>
                  ) : (
                    <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                      {t("transactions.drafts.freeCart", { n: d.item_count })}
                    </span>
                  )}
                  <span className="text-xs text-slate-400">{expanded === d.id ? "▴" : "▾"}</span>
                </button>
                {expanded === d.id && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    {d.note && <p className="mb-2 text-xs text-slate-500">{d.note}</p>}
                    {isJob && (
                      <table className="mb-2 w-full">
                        <thead>
                          <tr>
                            <th className={th}>{t("transactions.colItemName")}</th>
                            <th className={th + " text-right"}>{t("transactions.drafts.colPlanned")}</th>
                            <th className={th + " text-right"}>{t("transactions.drafts.colPicked")}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {d.lines.map((l) => {
                            const p = productMap.get(l.product_id);
                            return (
                              <tr key={l.product_id}>
                                <td className={td}>{p?.name ?? p?.sku ?? l.product_id.slice(0, 8)}</td>
                                <td className={td + " text-right tabular-nums"}>{l.expected}</td>
                                <td
                                  className={
                                    td +
                                    " text-right tabular-nums " +
                                    (l.picked >= l.expected ? "text-emerald-700" : l.picked > 0 ? "text-amber-700" : "")
                                  }
                                >
                                  {l.picked}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    )}
                    <button onClick={() => setCancelId(d.id)} className={btn + " text-red-600"}>
                      {t("transactions.drafts.cancelBtn")}
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Даалгавар үүсгэх модал */}
      {showCreate && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setShowCreate(false)}
        >
          <div
            className="flex max-h-[90vh] w-full max-w-2xl flex-col rounded-xl bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="font-semibold text-slate-900">{t("transactions.drafts.newJob")}</h3>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label className={lbl}>{t("transactions.drafts.fromBranch")}</label>
                <select
                  value={fromBranch}
                  onChange={(e) => {
                    setFromBranch(e.target.value);
                    setLines(new Map()); // өөр салбар = өөр үлдэгдэл, жагсаалт шинээр
                  }}
                  className={ctl}
                >
                  <option value="">{t("transactions.drafts.choose")}</option>
                  {fromOptions.map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>{t("transactions.drafts.toBranch")}</label>
                <select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className={ctl}>
                  <option value="">{t("transactions.drafts.choose")}</option>
                  {branches.filter((b) => b.id !== fromBranch).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={lbl}>{t("transactions.drafts.note")}</label>
                <input value={note} onChange={(e) => setNote(e.target.value)} className={ctl} />
              </div>
            </div>

            {!fromBranch ? (
              <p className="mt-4 rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
                {t("transactions.drafts.pickFromFirst")}
              </p>
            ) : (
              <>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <div className="flex gap-1 rounded-lg bg-slate-100 p-1">
                    {(
                      [
                        { id: "stock" as const, label: "transactions.drafts.srcStock" },
                        { id: "all" as const, label: "transactions.drafts.srcAll" },
                      ]
                    ).map((o) => (
                      <button
                        key={o.id}
                        onClick={() => setSource(o.id)}
                        className={
                          "rounded-md px-3 py-1 text-sm " +
                          (source === o.id ? "bg-white font-medium text-indigo-700 shadow-sm" : "text-slate-600")
                        }
                      >
                        {t(o.label)}
                      </button>
                    ))}
                  </div>
                  <input
                    value={filter}
                    onChange={(e) => setFilter(e.target.value)}
                    placeholder={t("transactions.drafts.filterPh")}
                    className={ctl + " max-w-xs"}
                  />
                  <label
                    className={btn + " cursor-pointer"}
                    title={t("transactions.drafts.excelHint")}
                  >
                    📄 {t("transactions.drafts.excelBtn")}
                    <input
                      type="file"
                      accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                      className="hidden"
                      disabled={products.length === 0}
                      onChange={handleExcel}
                    />
                  </label>
                </div>
                {importInfo && (
                  <p className="mt-2 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs text-emerald-700">
                    {importInfo}
                  </p>
                )}
                {importWarn && (
                  <div className="mt-2 rounded-lg bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
                    <p className="font-medium">
                      {t("transactions.drafts.excelUnmatched", { n: importWarn.length })}
                    </p>
                    {importWarn.map((w, i) => (
                      <p key={i}>· {w}</p>
                    ))}
                  </div>
                )}

                <div className="mt-2 min-h-0 flex-1 overflow-auto rounded-lg border border-slate-200">
                  <table className="w-full">
                    <thead className="sticky top-0">
                      <tr>
                        <th className={th}>{t("transactions.colItemName")}</th>
                        <th className={th + " text-right"}>{t("transactions.drafts.colAvail")}</th>
                        <th className={th + " w-28 text-right"}>{t("transactions.drafts.colQty")}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pickerRows.length === 0 && (
                        <tr>
                          <td colSpan={3} className="px-3 py-6 text-center text-sm text-slate-400">
                            {t("transactions.drafts.noStock")}
                          </td>
                        </tr>
                      )}
                      {pickerRows.map(({ p, avail }) => (
                        <tr key={p.id} className={lines.has(p.id) ? "bg-indigo-50/40" : ""}>
                          <td className={td}>
                            {p.name ?? "—"}
                            {p.sku && <span className="ml-1 font-mono text-xs text-slate-400">{p.sku}</span>}
                          </td>
                          <td className={td + " text-right tabular-nums"}>{avail}</td>
                          <td className={td + " text-right"}>
                            <input
                              type="number"
                              min={0}
                              max={avail > 0 ? avail : undefined}
                              value={lines.get(p.id) ?? ""}
                              onChange={(e) => setQty(p.id, Number(e.target.value) || 0, avail > 0 ? avail : undefined)}
                              className="h-8 w-20 rounded border border-slate-300 px-2 text-right text-sm"
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {lines.size > 0
                  ? t("transactions.drafts.planSummary", { products: lines.size, qty: totalPlanned })
                  : t("transactions.drafts.planEmpty")}
              </span>
              <div className="flex gap-2">
                <button onClick={() => setShowCreate(false)} className={btn}>
                  {t("common.cancel")}
                </button>
                <button
                  onClick={handleCreate}
                  disabled={busy || !fromBranch || !toBranch || lines.size === 0}
                  className={primaryBtn}
                >
                  {busy ? t("transactions.drafts.creating") : t("transactions.drafts.createBtn")}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {cancelId && (
        <ConfirmDialog
          message={t("transactions.drafts.confirmCancel")}
          confirmLabel={t("transactions.drafts.cancelBtn")}
          danger
          busy={busy}
          onConfirm={handleCancel}
          onCancel={() => setCancelId(null)}
        />
      )}
    </div>
  );
}
