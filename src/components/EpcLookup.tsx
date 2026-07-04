import { errorMessage } from "../lib/errorMessage";
import { useEffect, useState, type FormEvent } from "react";
import { normalizeEpc, epcHexToUri, epcHexToTagUri } from "../lib/epc";
import { lookupEpc, type EpcRow } from "../lib/queries";
import { badgeOf, labelOf } from "../lib/epcStatus";
import { fetchEpcHistory, EVENT_META, type EpcHistoryItem } from "../lib/epcHistory";

interface Props {
  /** Өгвөл нээгдмэгц шууд хайна (жагсаалтаас EPC дээр дарж ирэхэд). */
  initialHex?: string;
}

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; row: EpcRow }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

/** hex -> Pure Identity URI; декод бүтэлгүйтвэл зураас. SGTIN/GID хоёуланг. */
function safeUri(hex: string): string {
  try {
    return epcHexToUri(hex);
  } catch {
    return "—";
  }
}

/** hex -> Tag URI; декод бүтэлгүйтвэл зураас. SGTIN/GID хоёуланг. */
function safeTagUri(hex: string): string {
  try {
    return epcHexToTagUri(hex);
  } catch {
    return "—";
  }
}

/** RFID-аас уншсан EPC-ийн мэдээлэл + бүрэн түүх (timeline). */
export default function EpcLookup({ initialHex }: Props) {
  const [raw, setRaw] = useState(initialHex ?? "");
  const [state, setState] = useState<State>(initialHex ? { kind: "loading" } : { kind: "idle" });
  const [history, setHistory] = useState<EpcHistoryItem[] | null>(null);

  async function runSearch(input: string): Promise<{ next: State; hist: EpcHistoryItem[] | null }> {
    const hex = normalizeEpc(input); // алдаа шидвэл дуудагч барина
    const row = await lookupEpc(hex);
    if (!row) return { next: { kind: "notfound" }, hist: null };
    const hist = await fetchEpcHistory(row.id);
    return { next: { kind: "found", row }, hist };
  }

  // Жагсаалтаас дарж ирсэн бол шууд хайна (state нь initializer-ээр loading).
  useEffect(() => {
    if (!initialHex) return;
    let active = true;
    void (async () => {
      try {
        const { next, hist } = await runSearch(initialHex);
        if (!active) return;
        setState(next);
        setHistory(hist);
      } catch (err) {
        if (active) setState({ kind: "error", message: errorMessage(err) });
      }
    })();
    return () => {
      active = false;
    };
  }, [initialHex]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setState({ kind: "loading" });
    setHistory(null);
    try {
      const { next, hist } = await runSearch(raw);
      setState(next);
      setHistory(hist);
    } catch (err) {
      setState({ kind: "error", message: errorMessage(err) });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">EPC хайлт</h2>
        <p className="mb-4 text-sm text-slate-500">
          RFID таг уншсан 24 тэмдэгт hex-ээ бичээд хайна уу — барааны мэдээлэл + бүрэн түүх гарна.
        </p>
        <div className="flex gap-2">
          <input
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="30360CE7040C0E4000000001"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 font-mono text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
          />
          <button
            type="submit"
            disabled={state.kind === "loading"}
            className="shrink-0 rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {state.kind === "loading" ? "Хайж байна…" : "Хайх"}
          </button>
        </div>
      </form>

      {state.kind === "error" && (
        <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{state.message}</p>
      )}

      {state.kind === "notfound" && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
          Энэ EPC бүртгэлд олдсонгүй.
        </p>
      )}

      {state.kind === "found" && (
        <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
          {/* Барааны толгой — Үлдэгдлийн модал шиг: нэр + SKU + баркод */}
          <div className="border-b border-slate-200 px-6 py-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-lg font-semibold text-slate-900">
                {state.row.name || state.row.sku || "Нэргүй бараа"}
              </h3>
              <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + badgeOf(state.row.status)}>
                {labelOf(state.row.status)}
              </span>
            </div>
            <p className="mt-0.5 text-xs text-slate-500">
              {state.row.sku && (
                <>SKU: <span className="font-mono">{state.row.sku}</span> · </>
              )}
              {state.row.gtin && (
                <>Баркод: <span className="font-mono">{state.row.gtin}</span> · </>
              )}
              {state.row.branch_name && <>Салбар: {state.row.branch_name}</>}
            </p>
            <p className="mt-2 break-all font-mono text-sm text-indigo-700">{state.row.epc_hex}</p>
            <p className="mt-1 break-all font-mono text-[11px] text-slate-400">
              {safeUri(state.row.epc_hex)} · {safeTagUri(state.row.epc_hex)}
            </p>
          </div>

          {/* Түүх — амьдралын дараалал (эртнээс сүүл рүү) */}
          <div className="px-6 py-4">
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-500">
              Түүх {history ? `(${history.length})` : ""}
            </h4>
            {!history ? (
              <p className="py-4 text-center text-sm text-slate-400">Түүх ачаалж байна…</p>
            ) : history.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">
                Түүх алга. (Supabase дээр schema.sql-ийн epc_events хэсгийг Run хийсэн эсэхийг шалгана уу.)
              </p>
            ) : (
              <ol className="relative ml-1.5 space-y-4 border-l-2 border-slate-100 pl-5">
                {history.map((ev) => {
                  const meta = EVENT_META[ev.event];
                  return (
                    <li key={ev.id} className="relative">
                      <span className="absolute -left-[27px] top-1 h-3 w-3 rounded-full border-2 border-white bg-slate-300" />
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + meta.cls}>
                          {meta.label}
                        </span>
                        <span className="text-xs tabular-nums text-slate-400">
                          {new Date(ev.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-700">{ev.detail}</p>
                      {ev.reason && <p className="mt-0.5 text-xs text-slate-500">Тэмдэглэл: {ev.reason}</p>}
                      {ev.actor_email && <p className="mt-0.5 text-xs text-slate-400">{ev.actor_email}</p>}
                    </li>
                  );
                })}
              </ol>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
