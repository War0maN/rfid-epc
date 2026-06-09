import { errorMessage } from "../lib/errorMessage";
import { useEffect, useState, type FormEvent } from "react";
import {
  addInvite,
  cancelInvite,
  listInvites,
  listMembers,
  type Invite,
  type Member,
  type Role,
} from "../lib/tenantAuth";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const ROLE_LABEL: Record<Role, string> = { admin: "Админ", operator: "Оператор" };

/** Admin: тенантын гишүүд + урилга удирдах. */
export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [saving, setSaving] = useState(false);

  function reload() {
    listMembers().then(setMembers).catch((e) => setError(errorMessage(e)));
    listInvites().then(setInvites).catch((e) => setError(errorMessage(e)));
  }

  useEffect(() => {
    let active = true;
    listMembers().then((m) => active && setMembers(m)).catch((e) => active && setError(errorMessage(e)));
    listInvites().then((i) => active && setInvites(i)).catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  async function handleInvite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaving(true);
    try {
      await addInvite(email, role);
      setEmail("");
      setRole("operator");
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleCancel(id: string) {
    setError(null);
    try {
      await cancelInvite(id);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h2 className="text-lg font-semibold text-slate-900">Хэрэглэгчид</h2>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Урих */}
      <form
        onSubmit={handleInvite}
        className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm"
      >
        <h3 className="mb-3 text-sm font-semibold text-slate-700">Хэрэглэгч урих</h3>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-slate-600">Имэйл</label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls}
              placeholder="hereglegch@company.com"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Эрх</label>
            <select value={role} onChange={(e) => setRole(e.target.value as Role)} className={inputCls}>
              <option value="operator">Оператор</option>
              <option value="admin">Админ</option>
            </select>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            {saving ? "Уриж байна…" : "Урих"}
          </button>
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Уригдсан хүн энэ имэйлээрээ <strong>Бүртгүүлэх</strong> хийхэд автоматаар таны
          байгууллагад нэгдэнэ.
        </p>
      </form>

      {/* Гишүүд */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Гишүүд ({members.length})
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex items-center justify-between px-4 py-2 text-sm">
              <span className="text-slate-800">{m.email ?? "—"}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {ROLE_LABEL[m.role]}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Хүлээгдэж буй урилга */}
      {invites.length > 0 && (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Хүлээгдэж буй урилга ({invites.length})
          </div>
          <ul className="divide-y divide-slate-100">
            {invites.map((inv) => (
              <li key={inv.id} className="flex items-center justify-between px-4 py-2 text-sm">
                <span className="text-slate-800">{inv.email}</span>
                <span className="flex items-center gap-3">
                  <span className="rounded bg-amber-50 px-2 py-0.5 text-xs text-amber-700">
                    {ROLE_LABEL[inv.role]}
                  </span>
                  <button
                    onClick={() => handleCancel(inv.id)}
                    className="text-xs text-red-600 hover:underline"
                  >
                    Цуцлах
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
