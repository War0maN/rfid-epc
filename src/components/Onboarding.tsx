import { errorMessage } from "../lib/errorMessage";
import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { createTenantAndAdmin } from "../lib/tenantAuth";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

interface Props {
  /** Тенант амжилттай үүссэний дараа (профайл дахин татах). */
  onDone: () => void;
}

/**
 * Нэвтэрсэн ч тенантгүй (шинэ) хэрэглэгчид байгууллагаа үүсгүүлэх дэлгэц.
 * Имэйл баталгаажуулалт идэвхтэй үед бүртгэлийн дараах алхам энд хийгдэнэ.
 */
export default function Onboarding({ onDone }: Props) {
  const [tenantName, setTenantName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await createTenantAndAdmin({ tenantName });
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm"
      >
        <h1 className="mb-1 text-xl font-semibold text-slate-900">Байгууллагаа үүсгэх</h1>
        <p className="mb-6 text-sm text-slate-500">
          Эхний удаа байгууллагынхаа мэдээллийг оруулна уу.
        </p>

        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        <label className={labelCls}>Байгууллагын нэр</label>
        <input
          required
          value={tenantName}
          onChange={(e) => setTenantName(e.target.value)}
          className={inputCls + " mb-4"}
          placeholder="Миний дэлгүүр"
        />

        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading ? "Үүсгэж байна…" : "Үүсгэх"}
        </button>

        <button
          type="button"
          onClick={() => supabase.auth.signOut()}
          className="mt-3 w-full rounded-lg border border-slate-300 px-4 py-2 text-sm text-slate-600 hover:bg-slate-50"
        >
          Гарах
        </button>
      </form>
    </div>
  );
}
