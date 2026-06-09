import { useEffect, useState, type FormEvent } from "react";
import {
  listTenants,
  loginWithTenant,
  signUpAndCreateTenant,
  type TenantOption,
} from "../lib/tenantAuth";

type Mode = "login" | "signup";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

/** Нэвтрэх (тенант сонгох + нэвтрэх нэр/имэйл + нууц үг) ба бүртгүүлэх дэлгэц. */
export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Tenant dropdown
  const [tenants, setTenants] = useState<TenantOption[]>([]);
  const [tenantId, setTenantId] = useState("");

  // Login талбар
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");

  // Signup талбар
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [gs1Prefix, setGs1Prefix] = useState("");

  useEffect(() => {
    listTenants()
      .then(setTenants)
      .catch(() => {}); // тенант байхгүй/унших боломжгүй бол dropdown хоосон
  }, []);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithTenant({ tenantId: tenantId || undefined, identifier, password });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleSignup(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);
    try {
      const { needsEmailConfirm } = await signUpAndCreateTenant({
        email,
        password,
        username,
        tenantName,
        gs1Prefix,
      });
      if (needsEmailConfirm) {
        setInfo(
          "Бүртгэл үүслээ. Имэйлээ баталгаажуулаад нэвтэрнэ үү — нэвтэрсний дараа байгууллагаа үүсгэнэ."
        );
        setMode("login");
      }
      // Session шууд гарвал useSession автоматаар үндсэн апп руу шилжүүлнэ.
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">RFID EPC Generator</h1>

        {/* Горим солих */}
        <div className="mb-6 mt-4 flex rounded-lg bg-slate-100 p-1 text-sm">
          {(["login", "signup"] as Mode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => {
                setMode(m);
                setError(null);
                setInfo(null);
              }}
              className={
                "flex-1 rounded-md px-3 py-1.5 font-medium transition " +
                (mode === m ? "bg-white text-indigo-700 shadow-sm" : "text-slate-500")
              }
            >
              {m === "login" ? "Нэвтрэх" : "Бүртгүүлэх"}
            </button>
          ))}
        </div>

        {info && (
          <p className="mb-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>
        )}
        {error && (
          <p className="mb-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {mode === "login" ? (
          <form onSubmit={handleLogin}>
            <label className={labelCls}>Тенант (байгууллага)</label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className={inputCls + " mb-1"}
            >
              <option value="">— Сонгох —</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <p className="mb-4 text-xs text-slate-500">
              Нэвтрэх нэрээр орвол заавал, имэйлээр орвол шаардлагагүй.
            </p>

            <label className={labelCls}>Нэвтрэх нэр эсвэл имэйл</label>
            <input
              required
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="нэр эсвэл you@company.com"
            />

            <label className={labelCls}>Нууц үг</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="••••••••"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Нэвтэрч байна…" : "Нэвтрэх"}
            </button>
          </form>
        ) : (
          <form onSubmit={handleSignup}>
            <label className={labelCls}>Байгууллагын нэр</label>
            <input
              required
              value={tenantName}
              onChange={(e) => setTenantName(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="Миний компани"
            />

            <label className={labelCls}>GS1 Company Prefix</label>
            <input
              required
              value={gs1Prefix}
              onChange={(e) => setGs1Prefix(e.target.value)}
              className={inputCls + " mb-1"}
              placeholder="8600001"
              inputMode="numeric"
            />
            <p className="mb-4 text-xs text-slate-500">6–12 оронтой, GS1-ээс олгосон угтвар.</p>

            <label className={labelCls}>Нэвтрэх нэр</label>
            <input
              required
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="admin"
            />

            <label className={labelCls}>Имэйл</label>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="you@company.com"
            />

            <label className={labelCls}>Нууц үг</label>
            <input
              type="password"
              required
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={inputCls + " mb-4"}
              placeholder="••••••••"
            />

            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? "Үүсгэж байна…" : "Бүртгүүлж байгууллага үүсгэх"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
