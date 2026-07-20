import { createClient } from "@supabase/supabase-js";
import i18n from "../i18n";

// .env (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(i18n.t("errors.supabaseConfigMissing"));
}

// ============================================================
// "Намайг сана" — session хадгалах байрлалыг сонгодог storage adapter.
//   Сануулсан үед localStorage (browser хаагаад ч хадгалагдана),
//   үгүй бол sessionStorage (tab/browser хаахад устана).
//   Туг нь үргэлж localStorage-д (default = сануулна — хуучин зан төлөвтэй ижил).
// ============================================================
const REMEMBER_KEY = "remember";

function rememberEnabled(): boolean {
  return localStorage.getItem(REMEMBER_KEY) !== "0";
}

/** Login дэлгэцийн checkbox нэвтрэхийн ӨМНӨ дуудна. */
export function setRemember(v: boolean) {
  localStorage.setItem(REMEMBER_KEY, v ? "1" : "0");
}

export function getRemember(): boolean {
  return rememberEnabled();
}

const authStorage = {
  getItem: (key: string) => localStorage.getItem(key) ?? sessionStorage.getItem(key),
  setItem: (key: string, value: string) => {
    const target = rememberEnabled() ? localStorage : sessionStorage;
    const other = rememberEnabled() ? sessionStorage : localStorage;
    other.removeItem(key); // хуучирсан хуулбар нөгөө талд үлдэхээс сэргийлнэ
    target.setItem(key, value);
  },
  removeItem: (key: string) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
  },
};

export const supabase = createClient(url, anonKey, {
  auth: { storage: authStorage },
});
