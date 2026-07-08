import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { listBranches, type Branch } from "../lib/branches";
import { normalizeEpc } from "../lib/epc";
import {
  TX_TYPES,
  TX_TYPE_LABEL,
  TX_TYPE_BADGE,
  TX_STATUS_LABEL,
  TX_STATUS_BADGE,
  listTransactions,
  fetchActiveEpcsByBranch,
  createTransaction,
  receiveTransfer,
  cancelTransfer,
  fetchTxItems,
  type TxType,
  type TxRow,
  type TxItem,
  type ActiveEpcItem,
} from "../lib/transactions";
import { toCsv, downloadCsv } from "../lib/exportCsv";
import { errorMessage } from "../lib/errorMessage";
import { makeCan, type Perm } from "../lib/permissions";

interface Props {
  refreshKey?: number;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). Эх салбарын сонголтыг шүүнэ. */
  allowedBranches?: string[] | null;
  /** Олгосон эрхүүд (null = бүрэн). Төрөл/товч нуухад — DB (RPC) давхар хамгаална. */
  perms?: string[] | null;
}

const TYPE_PERM: Record<TxType, Perm> = {
  sale: "act_sale",
  transfer: "act_transfer",
  other: "act_other",
  return: "act_return",
};

/** Гүйлгээний төрөлд тохирох (сагсанд орж болох) EPC-ийн төлөвүүд. */
const statusesFor = (t: TxType) => (t === "return" ? ["sold", "other"] : ["active"]);

// Дээд мөрийн бүх удирдлага нэг өндөртэй (h-9) — жигд харагдана.
const ctl =
  "h-9 w-full rounded border border-slate-300 px-2 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";
const lbl = "mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500";

const AVAIL_RENDER_CAP = 300; // жагсаалтад нэг дор харуулах дээд тоо (шүүлтээр нарийсгана)

/**
 * Гүйлгээ (Phase 5) — 2 дэд таб: шинэ гүйлгээ (скан→сагс) ба түүх.
 * Урсгал: салбар сонгох → идэвхтэй EPC жагсаалт (доод) → скан/шивэлт/дарж
 * сагсанд (дээд) нэмэх → нийт дүнтэй баталгаажуулах.
 */
export default function Transactions({ refreshKey = 0, allowedBranches = null, perms = null }: Props) {
  const { t } = useTranslation();
  // Эх салбарын сонголт: хуваарилагдсан салбараар шүүнэ (очих салбар бүрэн үлдэнэ).
  const filterMine = (list: Branch[]) =>
    allowedBranches ? list.filter((b) => allowedBranches.includes(b.id)) : list;
  const can = makeCan(perms);
  // Эрхтэй гүйлгээний төрлүүд (dropdown-д зөвхөн эдгээр).
  const allowedTypes = TX_TYPES.filter((t) => can(TYPE_PERM[t]));
  const [view, setView] = useState<"new" | "history">("new");

  const [rows, setRows] = useState<TxRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Шинэ гүйлгээний төлөв
  const [txTypeState, setTxType] = useState<TxType>("sale");
  // Сонгосон төрөл эрхгүй бол эхний эрхтэй төрөл рүү унана.
  const txType: TxType = allowedTypes.includes(txTypeState) ? txTypeState : (allowedTypes[0] ?? "sale");
  const [fromBranch, setFromBranch] = useState("");
  const [toBranch, setToBranch] = useState("");
  const [note, setNote] = useState("");
  const [avail, setAvail] = useState<ActiveEpcItem[] | null>(null); // сонгосон салбарын идэвхтэй EPC
  const [availLoading, setAvailLoading] = useState(false);
  const [availFilter, setAvailFilter] = useState("");
  const [cart, setCart] = useState<Map<string, ActiveEpcItem>>(new Map()); // id → item
  const [scan, setScan] = useState("");
  const [scanMsg, setScanMsg] = useState<{ kind: "ok" | "warn"; text: string } | null>(null);
  const scanRef = useRef<HTMLInputElement>(null);

  // Дэлгэрэнгүй модал (түүх)
  const [detail, setDetail] = useState<TxRow | null>(null);
  const [detailItems, setDetailItems] = useState<TxItem[] | null>(null);

  function reload() {
    setLoading(true);
    Promise.all([listTransactions(), listBranches()])
      .then(([t, b]) => {
        setRows(t);
        setBranches(b);
        setError(null);
      })
      .catch((e) => setError(errorMessage(e)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    let active = true;
    Promise.all([listTransactions(), listBranches()])
      .then(([t, b]) => {
        if (!active) return;
        setRows(t);
        setBranches(b);
      })
      .catch((e) => active && setError(errorMessage(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [refreshKey]);

  useEffect(() => {
    if (!detail) return;
    let active = true;
    fetchTxItems(detail.id)
      .then((d) => active && setDetailItems(d))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [detail]);

  // Сүүлийн хүсэлтийг таних тоолуур — хуучирсан салбарын хариу дарж бичихээс сэргийлнэ.
  const availReq = useRef(0);
  function loadAvail(branchId: string, statuses: string[]) {
    setAvailLoading(true);
    const req = ++availReq.current;
    fetchActiveEpcsByBranch(branchId, statuses)
      .then((d) => availReq.current === req && setAvail(d))
      .catch((e) => availReq.current === req && setError(errorMessage(e)))
      .finally(() => availReq.current === req && setAvailLoading(false));
  }

  function selectBranch(id: string) {
    setFromBranch(id);
    setCart(new Map());
    setScanMsg(null);
    setAvailFilter("");
    setAvail(null);
    if (!id) return;
    loadAvail(id, statusesFor(txType));
    // Салбар сонгосны дараа скан талбарт фокус (уншигч шууд бичихэд бэлэн).
    setTimeout(() => scanRef.current?.focus(), 0);
  }

  /** Төрөл солиход сагс цэвэрлээд жагсаалтыг шинэ төрлийн төлөвөөр дахин татна. */
  function selectType(t: TxType) {
    setTxType(t);
    setCart(new Map());
    setScanMsg(null);
    if (fromBranch) loadAvail(fromBranch, statusesFor(t));
  }

  function openDetail(tx: TxRow) {
    setDetailItems(null);
    setDetail(tx);
  }

  // hex → item хайлтын map (скан таарууулахад).
  const availByHex = useMemo(() => {
    const m = new Map<string, ActiveEpcItem>();
    for (const a of avail ?? []) m.set(a.epc_hex, a);
    return m;
  }, [avail]);

  /** Нэг EPC-г сагсанд нэмнэ (скан/шивэлт/жагсаалтаас). */
  function addItem(item: ActiveEpcItem) {
    if (cart.has(item.id)) {
      setScanMsg({ kind: "warn", text: t("transactions.scanAlreadyInCart", { hex: item.epc_hex }) });
      return;
    }
    setCart((c) => new Map(c).set(item.id, item));
    setScanMsg({ kind: "ok", text: `+ ${item.name || item.sku || item.epc_hex}` });
  }

  /** Скан/шивсэн текстийг боловсруулна (Enter эсвэл paste — олон EPC байж болно). */
  function processScan(text: string) {
    const tokens = text.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    let added = 0;
    let lastWarn: string | null = null;
    for (const tok of tokens) {
      let hex: string;
      try {
        hex = normalizeEpc(tok);
      } catch {
        lastWarn = t("transactions.scanInvalidFormat", { token: tok });
        continue;
      }
      const item = availByHex.get(hex);
      if (!item) {
        lastWarn = t("transactions.scanNotFound", { hex });
        continue;
      }
      if (cart.has(item.id)) {
        lastWarn = t("transactions.scanAlreadyInCart", { hex });
        continue;
      }
      setCart((c) => new Map(c).set(item.id, item));
      added++;
    }
    if (lastWarn && added === 0) setScanMsg({ kind: "warn", text: lastWarn });
    else if (added > 0)
      setScanMsg({
        kind: lastWarn ? "warn" : "ok",
        text: t("transactions.scanAdded", { n: added }) + (lastWarn ? ` · ${lastWarn}` : ""),
      });
    setScan("");
  }

  function removeFromCart(id: string) {
    setCart((c) => {
      const n = new Map(c);
      n.delete(id);
      return n;
    });
  }

  // Сагсанд ороогүй үлдсэн (жагсаалтад харуулах) EPC-үүд + текст шүүлт.
  const remaining = useMemo(() => {
    const list = (avail ?? []).filter((a) => !cart.has(a.id));
    const q = availFilter.trim().toLowerCase();
    if (!q) return list;
    return list.filter((a) =>
      [a.name, a.sku, a.gtin, a.epc_hex].some((v) => v && v.toLowerCase().includes(q))
    );
  }, [avail, cart, availFilter]);

  const cartItems = useMemo(() => [...cart.values()], [cart]);
  const cartTotal = useMemo(() => cartItems.reduce((s, i) => s + (i.price ?? 0), 0), [cartItems]);
  const pendingCount = useMemo(
    () => rows.filter((r) => r.type === "transfer" && r.status === "pending").length,
    [rows]
  );

  async function handleConfirm() {
    if (cartItems.length === 0) return;
    setBusy(true);
    setError(null);
    try {
      await createTransaction(
        txType,
        txType === "transfer" ? toBranch || null : null,
        note,
        cartItems.map((i) => i.id)
      );
      setInfo(
        t("transactions.successInfo", {
          type: TX_TYPE_LABEL[txType],
          n: cartItems.length,
          total: cartTotal.toLocaleString(),
        }) +
          (txType === "transfer" ? " " + t("transactions.pendingSuffix") : "") +
          "."
      );
      // Сагс цэвэрлээд салбарын жагсаалтыг шинэчилнэ (гүйлгээнд орсон EPC идэвхтэй биш болсон).
      setCart(new Map());
      setNote("");
      setScanMsg(null);
      if (fromBranch) loadAvail(fromBranch, statusesFor(txType));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive(tx: TxRow) {
    if (!window.confirm(t("transactions.receiveConfirm", { n: tx.item_count, branch: tx.to_branch_name ?? "?" }))) return;
    setBusy(true);
    setError(null);
    try {
      await receiveTransfer(tx.id);
      setInfo(t("transactions.receiveSuccess"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(tx: TxRow) {
    if (!window.confirm(t("transactions.cancelConfirm", { n: tx.item_count }))) return;
    setBusy(true);
    setError(null);
    try {
      await cancelTransfer(tx.id);
      setInfo(t("transactions.cancelSuccess"));
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  function handleDetailExport() {
    if (!detail || !detailItems || detailItems.length === 0) return;
    const esc = (s: string) => '"' + s.replace(/"/g, '""') + '"';
    const head = [
      [t("transactions.title"), TX_TYPE_LABEL[detail.type]],
      [t("common.date"), new Date(detail.created_at).toLocaleString()],
      [t("common.branch"), txBranchText(detail)],
      [t("common.qty"), String(detailItems.length)],
    ]
      .map(([k, v]) => `${esc(k)},${esc(v)}`)
      .join("\r\n");
    const table = toCsv(
      detailItems.map((it) => ({
        name: it.name ?? "",
        sku: it.sku ?? "",
        epc: it.epc_hex,
        serial: it.serial,
        price: it.price ?? "",
      })),
      [
        { key: "name", label: t("common.product") },
        { key: "sku", label: "SKU" },
        { key: "epc", label: "EPC (hex)" },
        { key: "serial", label: "Serial" },
        { key: "price", label: t("common.price") },
      ]
    );
    downloadCsv(`tx-${detail.type}-${new Date(detail.created_at).toISOString().slice(0, 10)}.csv`, head + "\r\n\r\n" + table);
  }

  function txBranchText(tx: TxRow): string {
    if (tx.type === "transfer") return `${tx.from_branch_name ?? t("transactions.noBranch")} → ${tx.to_branch_name ?? "?"}`;
    return tx.from_branch_name ?? t("transactions.noBranch");
  }

  const th =
    "border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 last:border-r-0";
  const td = "border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0";
  const subTab = (active: boolean) =>
    "rounded-t-lg border-b-2 px-4 py-2 text-sm font-medium " +
    (active
      ? "border-indigo-600 text-indigo-700"
      : "border-transparent text-slate-500 hover:text-slate-700");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{t("transactions.title")}</h2>
          <p className="text-sm text-slate-500">
            {t("transactions.subtitle")}
          </p>
        </div>
        <div className="flex-1" />
        <button onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          ↻ {t("transactions.refresh")}
        </button>
      </div>

      {/* Дэд табууд */}
      <div className="flex gap-1 border-b border-slate-200">
        <button onClick={() => setView("new")} className={subTab(view === "new")}>
          {t("transactions.title")}
        </button>
        <button onClick={() => setView("history")} className={subTab(view === "history")}>
          {t("transactions.tabHistory")}
          {pendingCount > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">
              {pendingCount}
            </span>
          )}
        </button>
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      {view === "new" && allowedTypes.length === 0 && (
        <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-400">
          {t("transactions.noPermission")}
        </p>
      )}
      {view === "new" && allowedTypes.length > 0 && (
        <div className="space-y-3">
          {/* Тохиргооны мөр — бүх удирдлага нэг өндөртэй */}
          <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <label className="w-44 text-sm">
              <span className={lbl}>{t("transactions.typeLabel")}</span>
              <select value={txType} onChange={(e) => selectType(e.target.value as TxType)} className={ctl}>
                {allowedTypes.map((t) => (
                  <option key={t} value={t}>{TX_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="w-52 text-sm">
              <span className={lbl}>{t("transactions.fromBranch")}</span>
              <select value={fromBranch} onChange={(e) => selectBranch(e.target.value)} className={ctl}>
                <option value="">{t("transactions.selectOption")}</option>
                {filterMine(branches).map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            {txType === "transfer" && (
              <label className="w-52 text-sm">
                <span className={lbl}>{t("transactions.toBranch")}</span>
                <select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className={ctl}>
                  <option value="">{t("transactions.selectOption")}</option>
                  {branches.filter((b) => b.id !== fromBranch).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="min-w-[220px] flex-1 text-sm">
              <span className={lbl}>{t("common.note")}</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("transactions.notePlaceholder")} className={ctl} />
            </label>
          </div>

          {!fromBranch ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-10 text-center text-sm text-slate-400">
              {t("transactions.selectBranchFirst")}
            </p>
          ) : (
            <>
              {/* Скан талбар */}
              <div>
                <input
                  ref={scanRef}
                  value={scan}
                  onChange={(e) => setScan(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      processScan(scan);
                    }
                  }}
                  onPaste={(e) => {
                    const text = e.clipboardData.getData("text");
                    if (/[\s,;]/.test(text.trim())) {
                      e.preventDefault();
                      processScan(text);
                    }
                  }}
                  placeholder={t("transactions.scanPlaceholder")}
                  className="h-11 w-full rounded-lg border border-slate-300 px-3 font-mono text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                  autoFocus
                />
                {scanMsg && (
                  <p className={"mt-1 text-xs " + (scanMsg.kind === "ok" ? "text-emerald-600" : "text-amber-600")}>
                    {scanMsg.text}
                  </p>
                )}
              </div>

              {/* Сагс — бүтэн өргөн */}
              <div className="rounded-xl border-2 border-indigo-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                    🛒 {t("transactions.cart")} ({cartItems.length.toLocaleString()})
                  </span>
                  <span className="ml-auto text-sm font-semibold text-indigo-900">
                    {cartTotal.toLocaleString()}₮
                  </span>
                </div>
                <div className="max-h-[40vh] overflow-auto">
                  {cartItems.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-400">
                      {t("transactions.cartEmpty")}
                    </p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className={th}>{t("transactions.colItemName")}</th>
                          <th className={th}>SKU</th>
                          <th className={th}>{t("common.barcode")}</th>
                          <th className={th}>{t("transactions.colEpcCode")}</th>
                          <th className={th + " text-right"}>{t("transactions.colItemPrice")}</th>
                          <th className={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {cartItems.map((i) => (
                          <tr key={i.id} className="hover:bg-slate-50">
                            <td className={td}>{i.name || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{i.sku || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{i.gtin || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{i.epc_hex}</td>
                            <td className={td + " text-right tabular-nums"}>{i.price != null ? i.price.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                            <td className={td + " text-right"}>
                              <button
                                onClick={() => removeFromCart(i.id)}
                                className="rounded border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-100"
                              >
                                − {t("transactions.remove")}
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
                <div className="border-t border-indigo-100 px-3 py-2">
                  <button
                    onClick={handleConfirm}
                    disabled={busy || cartItems.length === 0 || (txType === "transfer" && !toBranch)}
                    className="w-full rounded-lg bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                  >
                    {t("transactions.confirmButton", {
                      type: TX_TYPE_LABEL[txType],
                      n: cartItems.length.toLocaleString(),
                      total: cartTotal.toLocaleString(),
                    })}
                  </button>
                </div>
              </div>

              {/* Салбарын идэвхтэй EPC — бүтэн өргөн, хамгийн доор */}
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
                <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    {txType === "return" ? t("transactions.availReturnable") : t("transactions.availActive")} (
                    {availLoading ? "…" : remaining.length.toLocaleString()})
                  </span>
                  <input
                    value={availFilter}
                    onChange={(e) => setAvailFilter(e.target.value)}
                    placeholder={t("transactions.availSearchPlaceholder")}
                    className="ml-auto h-8 w-64 rounded border border-slate-200 px-2 text-xs outline-none focus:border-indigo-400"
                  />
                </div>
                <div className="max-h-[45vh] overflow-auto">
                  {availLoading ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-400">{t("common.loading")}</p>
                  ) : remaining.length === 0 ? (
                    <p className="px-3 py-8 text-center text-sm text-slate-400">
                      {(avail ?? []).length === 0
                        ? txType === "return"
                          ? t("transactions.emptyReturnable")
                          : t("transactions.emptyActive")
                        : t("transactions.emptyFiltered")}
                    </p>
                  ) : (
                    <table className="min-w-full text-sm">
                      <thead>
                        <tr>
                          <th className={th}>{t("transactions.colItemName")}</th>
                          <th className={th}>SKU</th>
                          <th className={th}>{t("common.barcode")}</th>
                          <th className={th}>{t("transactions.colEpcCode")}</th>
                          <th className={th + " text-right"}>{t("transactions.colItemPrice")}</th>
                          <th className={th} />
                        </tr>
                      </thead>
                      <tbody>
                        {remaining.slice(0, AVAIL_RENDER_CAP).map((a) => (
                          <tr key={a.id} className="hover:bg-slate-50">
                            <td className={td}>{a.name || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{a.sku || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{a.gtin || <span className="text-slate-300">—</span>}</td>
                            <td className={td + " font-mono text-xs"}>{a.epc_hex}</td>
                            <td className={td + " text-right tabular-nums"}>{a.price != null ? a.price.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                            <td className={td + " text-right"}>
                              <button
                                onClick={() => addItem(a)}
                                className="rounded border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-700 hover:bg-indigo-100"
                              >
                                + {t("common.add")}
                              </button>
                            </td>
                          </tr>
                        ))}
                        {remaining.length > AVAIL_RENDER_CAP && (
                          <tr>
                            <td colSpan={6} className="px-3 py-2 text-center text-xs text-slate-400">
                              {t("transactions.moreRows", { n: remaining.length.toLocaleString() })}
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {view === "history" && (
        <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="min-w-full text-sm">
            <thead>
              <tr>
                <th className={th}>{t("common.date")}</th>
                <th className={th}>{t("transactions.typeLabel")}</th>
                <th className={th}>{t("common.status")}</th>
                <th className={th}>{t("common.branch")}</th>
                <th className={th + " text-right"}>{t("common.qty")}</th>
                <th className={th}>{t("transactions.colWho")}</th>
                <th className={th}>{t("common.note")}</th>
                {pendingCount > 0 && <th className={th + " text-right"}>{t("transactions.colReceipt")}</th>}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</td></tr>
              ) : rows.length === 0 ? (
                <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">{t("transactions.noTransactions")}</td></tr>
              ) : (
                rows.map((tx) => (
                  <tr key={tx.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(tx)}>
                    <td className={td + " whitespace-nowrap"}>{new Date(tx.created_at).toLocaleString()}</td>
                    <td className={td}>
                      <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + TX_TYPE_BADGE[tx.type]}>{TX_TYPE_LABEL[tx.type]}</span>
                    </td>
                    <td className={td}>
                      <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + TX_STATUS_BADGE[tx.status]}>{TX_STATUS_LABEL[tx.status]}</span>
                    </td>
                    <td className={td}>{txBranchText(tx)}</td>
                    <td className={td + " text-right tabular-nums"}>{tx.item_count}</td>
                    <td className={td + " text-xs"}>{tx.created_by_email || <span className="text-slate-300">—</span>}</td>
                    <td className={td + " max-w-[220px] truncate"}>{tx.note || <span className="text-slate-300">—</span>}</td>
                    {pendingCount > 0 && (
                      <td className={td + " text-right"} onClick={(e) => e.stopPropagation()}>
                        {tx.type === "transfer" && tx.status === "pending" && can("act_receive") && (
                          <div className="flex justify-end gap-2">
                            <button onClick={() => handleReceive(tx)} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">{t("transactions.receive")}</button>
                            <button onClick={() => handleCancel(tx)} disabled={busy} className="text-xs text-red-600 hover:underline disabled:opacity-50">{t("common.cancel")}</button>
                          </div>
                        )}
                      </td>
                    )}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Дэлгэрэнгүй модал */}
      {detail && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[80vh] w-full max-w-3xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-slate-900">
                  {TX_TYPE_LABEL[detail.type]} — {txBranchText(detail)}
                </h3>
                <p className="text-xs text-slate-500">
                  {new Date(detail.created_at).toLocaleString()} · {TX_STATUS_LABEL[detail.status]} ·{" "}
                  {detailItems ? `${detailItems.length} EPC` : "…"}
                  {detail.note && <> · {detail.note}</>}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <button
                  onClick={handleDetailExport}
                  disabled={!detailItems || detailItems.length === 0}
                  className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
                >
                  {t("common.exportCsv")}
                </button>
                <button onClick={() => setDetail(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              {!detailItems ? (
                <p className="px-4 py-10 text-center text-slate-400">{t("common.loading")}</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>{t("transactions.colItemName")}</th>
                      <th className={th}>SKU</th>
                      <th className={th}>{t("transactions.colEpcCode")}</th>
                      <th className={th + " text-right"}>Serial</th>
                      <th className={th + " text-right"}>{t("transactions.colItemPrice")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((it) => (
                      <tr key={it.epc_id} className="hover:bg-slate-50">
                        <td className={td}>{it.name || <span className="text-slate-300">—</span>}</td>
                        <td className={td + " font-mono text-xs"}>{it.sku || <span className="text-slate-300">—</span>}</td>
                        <td className={td + " font-mono text-xs"}>{it.epc_hex}</td>
                        <td className={td + " text-right tabular-nums"}>{it.serial}</td>
                        <td className={td + " text-right tabular-nums"}>{it.price != null ? it.price.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
