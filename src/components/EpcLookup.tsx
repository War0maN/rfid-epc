import { useState, type FormEvent, type ReactNode } from "react";
import { normalizeEpc } from "../lib/epc";
import { lookupEpc, type EpcRow } from "../lib/queries";

type State =
  | { kind: "idle" }
  | { kind: "loading" }
  | { kind: "found"; row: EpcRow }
  | { kind: "notfound" }
  | { kind: "error"; message: string };

function Field({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-slate-100 py-2 last:border-0">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-right text-sm font-medium text-slate-900">{value}</dd>
    </div>
  );
}

/** RFID-аас уншсан EPC hex-ийг бичээд эх ажил/бараа/serial-ийг буцааж олох. */
export default function EpcLookup() {
  const [raw, setRaw] = useState("");
  const [state, setState] = useState<State>({ kind: "idle" });

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    let hex: string;
    try {
      hex = normalizeEpc(raw);
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
      return;
    }

    setState({ kind: "loading" });
    try {
      const row = await lookupEpc(hex);
      setState(row ? { kind: "found", row } : { kind: "notfound" });
    } catch (err) {
      setState({ kind: "error", message: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <form onSubmit={handleSubmit} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">EPC хайлт</h2>
        <p className="mb-4 text-sm text-slate-500">
          RFID таг уншсан 24 тэмдэгт hex-ээ бичээд хайна уу.
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
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="mb-3 break-all font-mono text-sm text-indigo-700">{state.row.epc_hex}</p>
          <dl>
            <Field label="Бараа" value={state.row.products?.name || "—"} />
            <Field
              label="Item reference"
              value={<span className="font-mono">{state.row.products?.item_reference ?? "—"}</span>}
            />
            <Field
              label="Source GTIN"
              value={<span className="font-mono">{state.row.products?.source_gtin ?? "—"}</span>}
            />
            <Field label="Serial" value={state.row.serial} />
            <Field label="Ажлын №" value={state.row.jobs?.job_number ?? "—"} />
            <Field label="Ирсэн огноо" value={state.row.jobs?.arrival_date ?? "—"} />
            <Field label="Нийлүүлэгч" value={state.row.jobs?.supplier ?? "—"} />
            <Field label="Үүссэн" value={new Date(state.row.created_at).toLocaleString()} />
          </dl>
        </div>
      )}
    </div>
  );
}
