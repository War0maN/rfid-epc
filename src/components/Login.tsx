import { errorMessage } from "../lib/errorMessage";
import { useState, type FormEvent } from "react";
import { loginWithEmail, signUpUser } from "../lib/tenantAuth";

type Mode = "login" | "signup";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

/** Имэйл+нууц үгээр нэвтрэх ба байгууллага үүсгэж бүртгүүлэх дэлгэц. */
export default function Login() {
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      setError(errorMessage(err));
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
      const { needsEmailConfirm } = await signUpUser(email, password);
      if (needsEmailConfirm) {
        setInfo(
          "Бүртгэл үүслээ. Имэйлээ баталгаажуулаад нэвтэрнэ үү — нэвтэрсний дараа байгууллагаа үүсгэх эсвэл урилгад нэгдэнэ."
        );
        setMode("login");
      }
      // Session шууд гарвал useSession → App: урилга шалгаад онбординг/үндсэн апп.
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-1 text-2xl font-semibold text-slate-900">RFID EPC Generator</h1>

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

        <form onSubmit={mode === "login" ? handleLogin : handleSignup}>
          {mode === "signup" && (
            <p className="mb-4 rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500">
              Бүртгүүлсний дараа байгууллагаа үүсгэнэ. Хэрэв танд урилга ирсэн бол
              автоматаар тэр байгууллагад нэгдэнэ.
            </p>
          )}

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
            autoComplete={mode === "login" ? "current-password" : "new-password"}
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
            {loading
              ? mode === "login"
                ? "Нэвтэрч байна…"
                : "Үүсгэж байна…"
              : mode === "login"
                ? "Нэвтрэх"
                : "Бүртгүүлж байгууллага үүсгэх"}
          </button>
        </form>
      </div>
    </div>
  );
}
