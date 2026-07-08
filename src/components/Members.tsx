import { errorMessage } from "../lib/errorMessage";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addInvite,
  cancelInvite,
  listInvites,
  listMembers,
  setMemberBranches,
  setMemberPerms,
  type Invite,
  type Member,
  type Role,
} from "../lib/tenantAuth";
import { listBranches, type Branch } from "../lib/branches";
import { ALL_PERMS, PERM_GROUPS } from "../lib/permissions";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";

const ROLE_LABEL: Record<Role, string> = { admin: "Админ", operator: "Оператор" };

/** Admin: тенантын гишүүд (+ салбарын хуваарилалт) + урилга удирдах. */
export default function Members() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState("");
  const [role, setRole] = useState<Role>("operator");
  const [saving, setSaving] = useState(false);

  // Салбар хуваарилах модал: гишүүн + түр сонголт.
  const [branchModal, setBranchModal] = useState<Member | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [branchSaving, setBranchSaving] = useState(false);

  // Эрхийн модал: гишүүн + түр сонголт.
  const [permModal, setPermModal] = useState<Member | null>(null);
  const [pickedPerms, setPickedPerms] = useState<Set<string>>(new Set());
  const [permSaving, setPermSaving] = useState(false);

  const branchName = useMemo(() => new Map(branches.map((b) => [b.id, b.name])), [branches]);

  function reload() {
    listMembers().then(setMembers).catch((e) => setError(errorMessage(e)));
    listInvites().then(setInvites).catch((e) => setError(errorMessage(e)));
  }

  useEffect(() => {
    let active = true;
    listMembers().then((m) => active && setMembers(m)).catch((e) => active && setError(errorMessage(e)));
    listInvites().then((i) => active && setInvites(i)).catch((e) => active && setError(errorMessage(e)));
    listBranches().then((b) => active && setBranches(b)).catch((e) => active && setError(errorMessage(e)));
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

  function openBranchModal(m: Member) {
    setPicked(new Set(m.branch_ids));
    setBranchModal(m);
  }

  function togglePicked(id: string) {
    setPicked((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function handleSaveBranches() {
    if (!branchModal) return;
    setBranchSaving(true);
    setError(null);
    try {
      await setMemberBranches(branchModal.id, [...picked]);
      setBranchModal(null);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBranchSaving(false);
    }
  }

  function openPermModal(m: Member) {
    // Тохиргоогүй (бүрэн эрх) бол бүгд чеклэгдсэн байдлаар харуулна.
    setPickedPerms(new Set(m.perms.length > 0 ? m.perms : ALL_PERMS));
    setPermModal(m);
  }

  function togglePerm(key: string) {
    setPickedPerms((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });
  }

  async function handleSavePerms() {
    if (!permModal) return;
    setPermSaving(true);
    setError(null);
    try {
      // Бүгд чеклэгдсэн = бүрэн эрх (default) — хоосон болгож хадгална.
      const perms = pickedPerms.size === ALL_PERMS.length ? [] : [...pickedPerms];
      await setMemberPerms(permModal.id, perms);
      setPermModal(null);
      reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setPermSaving(false);
    }
  }

  /** Гишүүний хуваарилалтыг chip-үүдээр (хоосон = Бүгд). */
  function branchChips(m: Member) {
    if (m.branch_ids.length === 0) {
      return <span className="rounded bg-emerald-50 px-2 py-0.5 text-xs text-emerald-700">Бүх салбар</span>;
    }
    return m.branch_ids.map((id) => (
      <span key={id} className="rounded bg-indigo-50 px-2 py-0.5 text-xs text-indigo-700">
        {branchName.get(id) ?? "?"}
      </span>
    ));
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
          байгууллагад нэгдэнэ. Нэгдсэний дараа доороос салбар хуваарилна.
        </p>
      </form>

      {/* Гишүүд */}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-100 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          Гишүүд ({members.length})
        </div>
        <ul className="divide-y divide-slate-100">
          {members.map((m) => (
            <li key={m.id} className="flex flex-wrap items-center gap-2 px-4 py-2 text-sm">
              <span className="text-slate-800">{m.email ?? "—"}</span>
              <span className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                {ROLE_LABEL[m.role]}
              </span>
              <span className="flex flex-1 flex-wrap items-center justify-end gap-1.5">
                {m.role === "operator" ? (
                  <>
                    {branchChips(m)}
                    <span
                      className={
                        "rounded px-2 py-0.5 text-xs " +
                        (m.perms.length === 0
                          ? "bg-emerald-50 text-emerald-700"
                          : "bg-amber-50 text-amber-700")
                      }
                    >
                      {m.perms.length === 0 ? "Бүрэн эрх" : `${m.perms.length} эрх`}
                    </span>
                    <button
                      onClick={() => openBranchModal(m)}
                      className="ml-1 text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Салбар
                    </button>
                    <button
                      onClick={() => openPermModal(m)}
                      className="text-xs font-medium text-indigo-600 hover:underline"
                    >
                      Эрх
                    </button>
                  </>
                ) : (
                  <span className="text-xs text-slate-400">Бүрэн эрх (админ)</span>
                )}
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

      {/* Эрх тохируулах модал */}
      {permModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setPermModal(null)}
        >
          <div className="w-full max-w-lg rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">Эрх тохируулах</h3>
            <p className="mt-1 text-xs text-slate-500">
              {permModal.email} — сонгосон цэс/үйлдэл л зөвшөөрөгдөнө (UI + DB хоёуланд).
              <strong> Бүгдийг чеклэвэл бүрэн эрх</strong> (default) болно.
            </p>
            <div className="mt-3 grid max-h-80 grid-cols-1 gap-4 overflow-auto sm:grid-cols-2">
              {PERM_GROUPS.map((g) => (
                <div key={g.title}>
                  <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{g.title}</p>
                  <div className="space-y-0.5">
                    {g.perms.map((p) => (
                      <label
                        key={p.key}
                        className="flex cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50"
                      >
                        <input
                          type="checkbox"
                          checked={pickedPerms.has(p.key)}
                          onChange={() => togglePerm(p.key)}
                        />
                        {p.label}
                      </label>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {pickedPerms.size === ALL_PERMS.length
                  ? "Бүрэн эрх"
                  : `${pickedPerms.size}/${ALL_PERMS.length} эрх`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setPermModal(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Болих
                </button>
                <button
                  disabled={permSaving}
                  onClick={handleSavePerms}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {permSaving ? "Хадгалж байна…" : "Хадгалах"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Салбар хуваарилах модал */}
      {branchModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setBranchModal(null)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">Салбар хуваарилах</h3>
            <p className="mt-1 text-xs text-slate-500">
              {branchModal.email} — сонгосон салбарын өгөгдлийг л харж, гүйлгээ хийнэ.
              Юу ч сонгохгүй бол <strong>бүх салбар</strong> нээлттэй.
            </p>
            <div className="mt-3 max-h-64 space-y-1 overflow-auto">
              {branches.map((b) => (
                <label
                  key={b.id}
                  className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  <input type="checkbox" checked={picked.has(b.id)} onChange={() => togglePicked(b.id)} />
                  {b.name}
                  {b.code && <span className="font-mono text-xs text-slate-400">{b.code}</span>}
                </label>
              ))}
            </div>
            <div className="mt-4 flex items-center justify-between gap-2">
              <span className="text-xs text-slate-500">
                {picked.size === 0 ? "Бүх салбар" : `${picked.size} салбар`}
              </span>
              <div className="flex gap-2">
                <button
                  onClick={() => setBranchModal(null)}
                  className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
                >
                  Болих
                </button>
                <button
                  disabled={branchSaving}
                  onClick={handleSaveBranches}
                  className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
                >
                  {branchSaving ? "Хадгалж байна…" : "Хадгалах"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
