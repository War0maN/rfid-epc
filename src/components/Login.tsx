import { errorMessage } from "../lib/errorMessage";
import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { loginWithEmail, signUpUser, sendPasswordReset } from "../lib/tenantAuth";
import { getRemember, setRemember } from "../lib/supabaseClient";
import { LANGS, setLang, type Lang } from "../i18n";

type Mode = "login" | "signup";

const inputCls =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200";
const labelCls = "mb-1 block text-sm font-medium text-slate-700";

/** Имэйл+нууц үгээр нэвтрэх ба байгууллага үүсгэж бүртгүүлэх дэлгэц. */
export default function Login() {
  const { t, i18n } = useTranslation();
  const [mode, setMode] = useState<Mode>("login");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  // "Намайг сана" — session localStorage-д үлдэх эсэх (default: сануулна).
  const [remember, setRememberState] = useState(getRemember);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      setRemember(remember); // нэвтрэхийн өмнө — token хаана хадгалагдахыг шийднэ
      await loginWithEmail(email, password);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setInfo(null);
    if (!email.trim()) {
      setError(t("auth.enterEmailFirst"));
      return;
    }
    setLoading(true);
    try {
      await sendPasswordReset(email);
      setInfo(t("auth.resetEmailSent", { email: email.trim() }));
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
        setInfo(t("auth.signupEmailConfirm"));
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
        <div className="mb-1 flex items-start justify-between gap-2">
          <h1 className="text-2xl font-semibold text-slate-900">Chipmo Inventory</h1>
          <select
            value={i18n.language}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="rounded-lg border border-slate-300 px-2 py-1 text-sm text-slate-700"
            aria-label="Language"
          >
            {LANGS.map((l) => (
              <option key={l.code} value={l.code}>
                {l.label}
              </option>
            ))}
          </select>
        </div>

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
              {m === "login" ? t("auth.login") : t("auth.signup")}
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
              {t("auth.signupHint")}
            </p>
          )}

          <label className={labelCls}>{t("auth.email")}</label>
          <input
            type="email"
            required
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls + " mb-4"}
            placeholder="you@company.com"
          />

          <label className={labelCls}>{t("auth.password")}</label>
          <input
            type="password"
            required
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls + " mb-4"}
            placeholder="••••••••"
          />

          {mode === "login" && (
            <div className="mb-4 flex items-center justify-between text-sm">
              <label className="flex cursor-pointer items-center gap-2 text-slate-600">
                <input
                  type="checkbox"
                  checked={remember}
                  onChange={(e) => setRememberState(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                {t("auth.rememberMe")}
              </label>
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={loading}
                className="text-indigo-600 hover:underline disabled:opacity-60"
              >
                {t("auth.forgotPassword")}
              </button>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60"
          >
            {loading
              ? mode === "login"
                ? t("auth.loggingIn")
                : t("auth.creating")
              : mode === "login"
                ? t("auth.login")
                : t("auth.signupAndCreateOrg")}
          </button>
        </form>
      </div>
    </div>
  );
}
