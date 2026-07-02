import { useEffect, useMemo, useRef, useState } from "react";
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

interface Props {
  refreshKey?: number;
}

const inp =
  "w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200";

const AVAIL_RENDER_CAP = 200; // жагсаалтад нэг дор харуулах дээд тоо (шүүлтээр нарийсгана)

/**
 * Гүйлгээ (Phase 5) — борлуулалт/шилжүүлэг/бусад.
 * UNIQLO маягийн урсгал: салбар сонгох → идэвхтэй EPC-ийн жагсаалт →
 * скан/шивэлт (эсвэл жагсаалтаас дарж) сагсанд нэмэх → баталгаажуулах.
 */
export default function Transactions({ refreshKey = 0 }: Props) {
  const [rows, setRows] = useState<TxRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Шинэ гүйлгээний форм
  const [formOpen, setFormOpen] = useState(false);
  const [txType, setTxType] = useState<TxType>("sale");
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

  // Дэлгэрэнгүй модал
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

  function openForm() {
    setFormOpen(true);
    setInfo(null);
    setCart(new Map());
    setScanMsg(null);
    setAvail(null);
    setAvailFilter("");
    setFromBranch("");
    setToBranch("");
    setNote("");
  }

  // Сүүлийн хүсэлтийг таних тоолуур — хуучирсан салбарын хариу дарж бичихээс сэргийлнэ.
  const availReq = useRef(0);
  function selectBranch(id: string) {
    setFromBranch(id);
    setCart(new Map());
    setScanMsg(null);
    setAvailFilter("");
    setAvail(null);
    if (!id) return;
    setAvailLoading(true);
    const req = ++availReq.current;
    fetchActiveEpcsByBranch(id)
      .then((d) => availReq.current === req && setAvail(d))
      .catch((e) => availReq.current === req && setError(errorMessage(e)))
      .finally(() => availReq.current === req && setAvailLoading(false));
    // Салбар сонгосны дараа скан талбарт фокус (уншигч шууд бичихэд бэлэн).
    setTimeout(() => scanRef.current?.focus(), 0);
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
      setScanMsg({ kind: "warn", text: `${item.epc_hex} — сагсанд аль хэдийн байна.` });
      return;
    }
    setCart((c) => new Map(c).set(item.id, item));
    setScanMsg({ kind: "ok", text: `+ ${item.name || item.sku || item.epc_hex}` });
  }

  /** Скан/шивсэн текстийг боловсруулна (Enter эсвэл paste — олон EPC байж болно). */
  function processScan(text: string) {
    const tokens = text.split(/[\s,;]+/).map((t) => t.trim()).filter(Boolean);
    if (tokens.length === 0) return;
    let added = 0;
    let lastWarn: string | null = null;
    for (const t of tokens) {
      let hex: string;
      try {
        hex = normalizeEpc(t);
      } catch {
        lastWarn = `${t} — EPC формат буруу.`;
        continue;
      }
      const item = availByHex.get(hex);
      if (!item) {
        lastWarn = `${hex} — энэ салбарын идэвхтэй EPC-ээс олдсонгүй.`;
        continue;
      }
      if (cart.has(item.id)) {
        lastWarn = `${hex} — сагсанд аль хэдийн байна.`;
        continue;
      }
      setCart((c) => new Map(c).set(item.id, item));
      added++;
    }
    if (lastWarn && added === 0) setScanMsg({ kind: "warn", text: lastWarn });
    else if (added > 0)
      setScanMsg({
        kind: lastWarn ? "warn" : "ok",
        text: `+ ${added} нэмэгдлээ` + (lastWarn ? ` · ${lastWarn}` : ""),
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
        `${TX_TYPE_LABEL[txType]} амжилттай: ${cartItems.length} EPC · ${cartTotal.toLocaleString()}₮` +
          (txType === "transfer" ? " (хүлээн авахаар хүлээгдэж байна)" : "") +
          "."
      );
      setFormOpen(false);
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleReceive(tx: TxRow) {
    if (!window.confirm(`${tx.item_count} EPC-г "${tx.to_branch_name ?? "?"}" салбарт хүлээн авах уу?`)) return;
    setBusy(true);
    setError(null);
    try {
      await receiveTransfer(tx.id);
      setInfo("Шилжүүлэг хүлээн авлаа — EPC-үүд очих салбартаа Идэвхтэй боллоо.");
      reload();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel(tx: TxRow) {
    if (!window.confirm(`Шилжүүлгийг цуцлах уу? ${tx.item_count} EPC эх салбартаа Идэвхтэй буцна.`)) return;
    setBusy(true);
    setError(null);
    try {
      await cancelTransfer(tx.id);
      setInfo("Шилжүүлэг цуцлагдлаа — EPC-үүд эх салбартаа буцлаа.");
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
      ["Гүйлгээ", TX_TYPE_LABEL[detail.type]],
      ["Огноо", new Date(detail.created_at).toLocaleString()],
      ["Салбар", txBranchText(detail)],
      ["Тоо", String(detailItems.length)],
    ]
      .map(([k, v]) => `${esc(k)},${esc(v)}`)
      .join("\r\n");
    const table = toCsv(
      detailItems.map((it) => ({
        epc: it.epc_hex,
        serial: it.serial,
        name: it.name ?? "",
        sku: it.sku ?? "",
        price: it.price ?? "",
      })),
      [
        { key: "epc", label: "EPC (hex)" },
        { key: "serial", label: "Serial" },
        { key: "name", label: "Бараа" },
        { key: "sku", label: "SKU" },
        { key: "price", label: "Үнэ" },
      ]
    );
    downloadCsv(`tx-${detail.type}-${new Date(detail.created_at).toISOString().slice(0, 10)}.csv`, head + "\r\n\r\n" + table);
  }

  function txBranchText(tx: TxRow): string {
    if (tx.type === "transfer") return `${tx.from_branch_name ?? "(Салбаргүй)"} → ${tx.to_branch_name ?? "?"}`;
    return tx.from_branch_name ?? "(Салбаргүй)";
  }

  const hasPending = useMemo(() => rows.some((r) => r.type === "transfer" && r.status === "pending"), [rows]);

  const th = "border-b border-slate-200 bg-slate-50 px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500";
  const td = "border-b border-slate-100 px-3 py-2 text-slate-700";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Гүйлгээ</h2>
          <p className="text-sm text-slate-500">
            Борлуулалт, шилжүүлэг, бусад — салбараа сонгоод EPC-г уншуулж/шивж сагсанд нэмнэ. Гүйлгээ устгагдахгүй (түүх).
          </p>
        </div>
        <div className="flex-1" />
        <button onClick={reload} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
          ↻ Сэргээх
        </button>
        {!formOpen && (
          <button onClick={openForm} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
            + Гүйлгээ
          </button>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
      {info && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

      {formOpen && (
        <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {/* Тохиргооны мөр */}
          <div className="flex flex-wrap items-end gap-3">
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Төрөл</span>
              <select value={txType} onChange={(e) => setTxType(e.target.value as TxType)} className={inp}>
                {TX_TYPES.map((t) => (
                  <option key={t} value={t}>{TX_TYPE_LABEL[t]}</option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Салбар (эх)</span>
              <select value={fromBranch} onChange={(e) => selectBranch(e.target.value)} className={inp}>
                <option value="">— Сонгох —</option>
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
            </label>
            {txType === "transfer" && (
              <label className="text-sm">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Очих салбар</span>
                <select value={toBranch} onChange={(e) => setToBranch(e.target.value)} className={inp}>
                  <option value="">— Сонгох —</option>
                  {branches.filter((b) => b.id !== fromBranch).map((b) => (
                    <option key={b.id} value={b.id}>{b.name}</option>
                  ))}
                </select>
              </label>
            )}
            <label className="min-w-[180px] flex-1 text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">Тэмдэглэл</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Сонголт…" className={inp} />
            </label>
            <button onClick={() => setFormOpen(false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50">
              Болих
            </button>
          </div>

          {!fromBranch ? (
            <p className="rounded-lg bg-slate-50 px-3 py-6 text-center text-sm text-slate-400">
              Эхлээд салбараа сонгоно уу — тухайн салбарын идэвхтэй EPC-ийн жагсаалт гарч ирнэ.
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
                  placeholder="📶 EPC уншуулах / шивэх (Enter) — RFID уншигч шууд энд бичнэ"
                  className={inp + " font-mono"}
                  autoFocus
                />
                {scanMsg && (
                  <p className={"mt-1 text-xs " + (scanMsg.kind === "ok" ? "text-emerald-600" : "text-amber-600")}>
                    {scanMsg.text}
                  </p>
                )}
              </div>

              {/* Хоёр самбар: салбарын жагсаалт | сагс */}
              <div className="grid gap-3 lg:grid-cols-2">
                {/* Салбарын идэвхтэй EPC */}
                <div className="rounded-lg border border-slate-200">
                  <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-50 px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Идэвхтэй EPC ({availLoading ? "…" : remaining.length.toLocaleString()})
                    </span>
                    <input
                      value={availFilter}
                      onChange={(e) => setAvailFilter(e.target.value)}
                      placeholder="Хайх (нэр/SKU/баркод/EPC)…"
                      className="ml-auto w-52 rounded border border-slate-200 px-2 py-1 text-xs outline-none focus:border-indigo-400"
                    />
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {availLoading ? (
                      <p className="px-3 py-8 text-center text-sm text-slate-400">Ачаалж байна…</p>
                    ) : remaining.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-slate-400">
                        {(avail ?? []).length === 0 ? "Энэ салбарт идэвхтэй EPC алга." : "Тохирох EPC алга."}
                      </p>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Бараа</th>
                            <th className={th}>SKU</th>
                            <th className={th}>Баркод</th>
                            <th className={th + " text-right"}>Үнэ</th>
                            <th className={th} />
                          </tr>
                        </thead>
                        <tbody>
                          {remaining.slice(0, AVAIL_RENDER_CAP).map((a) => (
                            <tr key={a.id} className="cursor-pointer hover:bg-indigo-50/40" onClick={() => addItem(a)} title={a.epc_hex}>
                              <td className={td}>{a.name || <span className="text-slate-300">—</span>}</td>
                              <td className={td + " font-mono text-xs"}>{a.sku || <span className="text-slate-300">—</span>}</td>
                              <td className={td + " font-mono text-xs"}>{a.gtin || <span className="text-slate-300">—</span>}</td>
                              <td className={td + " text-right tabular-nums"}>{a.price != null ? a.price.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                              <td className={td + " text-right"}>
                                <span className="text-xs font-medium text-indigo-600">+ Нэмэх</span>
                              </td>
                            </tr>
                          ))}
                          {remaining.length > AVAIL_RENDER_CAP && (
                            <tr>
                              <td colSpan={5} className="px-3 py-2 text-center text-xs text-slate-400">
                                … нийт {remaining.length.toLocaleString()} — хайлтаар нарийсгана уу
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    )}
                  </div>
                </div>

                {/* Сагс */}
                <div className="rounded-lg border-2 border-indigo-200">
                  <div className="flex items-center gap-2 border-b border-indigo-100 bg-indigo-50/60 px-3 py-2">
                    <span className="text-xs font-semibold uppercase tracking-wide text-indigo-700">
                      🛒 Сагс ({cartItems.length.toLocaleString()})
                    </span>
                    <span className="ml-auto text-sm font-semibold text-indigo-900">
                      {cartTotal.toLocaleString()}₮
                    </span>
                  </div>
                  <div className="max-h-80 overflow-auto">
                    {cartItems.length === 0 ? (
                      <p className="px-3 py-8 text-center text-sm text-slate-400">
                        Хоосон — EPC уншуулах эсвэл зүүн жагсаалтаас дарж нэмнэ.
                      </p>
                    ) : (
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr>
                            <th className={th}>Бараа</th>
                            <th className={th}>SKU</th>
                            <th className={th}>EPC</th>
                            <th className={th + " text-right"}>Үнэ</th>
                            <th className={th} />
                          </tr>
                        </thead>
                        <tbody>
                          {cartItems.map((i) => (
                            <tr key={i.id} className="hover:bg-slate-50">
                              <td className={td}>{i.name || <span className="text-slate-300">—</span>}</td>
                              <td className={td + " font-mono text-xs"}>{i.sku || <span className="text-slate-300">—</span>}</td>
                              <td className={td + " font-mono text-xs"} title={i.epc_hex}>…{i.epc_hex.slice(-6)}</td>
                              <td className={td + " text-right tabular-nums"}>{i.price != null ? i.price.toLocaleString() : <span className="text-slate-300">—</span>}</td>
                              <td className={td + " text-right"}>
                                <button onClick={() => removeFromCart(i.id)} className="text-xs text-red-600 hover:underline">✕</button>
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
                      {TX_TYPE_LABEL[txType]} баталгаажуулах ({cartItems.length.toLocaleString()}ш · {cartTotal.toLocaleString()}₮)
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Гүйлгээний түүх */}
      <div className="overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full text-sm">
          <thead>
            <tr>
              <th className={th}>Огноо</th>
              <th className={th}>Төрөл</th>
              <th className={th}>Төлөв</th>
              <th className={th}>Салбар</th>
              <th className={th + " text-right"}>Тоо</th>
              <th className={th}>Хэн</th>
              <th className={th}>Тэмдэглэл</th>
              {hasPending && <th className={th + " text-right"}>Хүлээн авалт</th>}
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Ачаалж байна…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-slate-400">Гүйлгээ алга. "+ Гүйлгээ" дарж эхэл.</td></tr>
            ) : (
              rows.map((tx) => (
                <tr key={tx.id} className="cursor-pointer hover:bg-slate-50" onClick={() => openDetail(tx)}>
                  <td className={td + " whitespace-nowrap"}>{new Date(tx.created_at).toLocaleString()}</td>
                  <td className={td}>
                    <span className={"rounded px-2 py-0.5 text-xs font-medium " + TX_TYPE_BADGE[tx.type]}>{TX_TYPE_LABEL[tx.type]}</span>
                  </td>
                  <td className={td}>
                    <span className={"rounded px-2 py-0.5 text-xs font-medium " + TX_STATUS_BADGE[tx.status]}>{TX_STATUS_LABEL[tx.status]}</span>
                  </td>
                  <td className={td}>{txBranchText(tx)}</td>
                  <td className={td + " text-right tabular-nums"}>{tx.item_count}</td>
                  <td className={td + " text-xs"}>{tx.created_by_email || <span className="text-slate-300">—</span>}</td>
                  <td className={td + " max-w-[220px] truncate"}>{tx.note || <span className="text-slate-300">—</span>}</td>
                  {hasPending && (
                    <td className={td + " text-right"} onClick={(e) => e.stopPropagation()}>
                      {tx.type === "transfer" && tx.status === "pending" && (
                        <div className="flex justify-end gap-2">
                          <button onClick={() => handleReceive(tx)} disabled={busy} className="text-xs font-medium text-emerald-600 hover:underline disabled:opacity-50">Хүлээн авах</button>
                          <button onClick={() => handleCancel(tx)} disabled={busy} className="text-xs text-red-600 hover:underline disabled:opacity-50">Цуцлах</button>
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

      {/* Дэлгэрэнгүй модал */}
      {detail && (
        <div className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4" onClick={() => setDetail(null)}>
          <div className="max-h-[80vh] w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl" onClick={(e) => e.stopPropagation()}>
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
                  CSV татах
                </button>
                <button onClick={() => setDetail(null)} className="rounded-lg px-2 py-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">✕</button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              {!detailItems ? (
                <p className="px-4 py-10 text-center text-slate-400">Ачаалж байна…</p>
              ) : (
                <table className="min-w-full text-sm">
                  <thead>
                    <tr>
                      <th className={th}>EPC (hex)</th>
                      <th className={th + " text-right"}>Serial</th>
                      <th className={th}>Бараа</th>
                      <th className={th}>SKU</th>
                      <th className={th + " text-right"}>Үнэ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detailItems.map((it) => (
                      <tr key={it.epc_id} className="hover:bg-slate-50">
                        <td className={td + " font-mono text-xs"}>{it.epc_hex}</td>
                        <td className={td + " text-right tabular-nums"}>{it.serial}</td>
                        <td className={td}>{it.name || <span className="text-slate-300">—</span>}</td>
                        <td className={td + " font-mono text-xs"}>{it.sku || <span className="text-slate-300">—</span>}</td>
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
