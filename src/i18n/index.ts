// ============================================================
// i18n тохиргоо — 3 хэл (mn/en/zh), localStorage-д хадгална.
//   Толь: locales/{mn,en,zh}/ доторх секц-файлууд (нэг файл = нэг домэйн).
//   main.tsx-д App-аас ӨМНӨ import хийгдэнэ.
// ============================================================
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import mn from "./locales/mn";
import en from "./locales/en";
import zh from "./locales/zh";

export const LANGS = [
  { code: "mn", label: "МН" },
  { code: "en", label: "EN" },
  { code: "zh", label: "中文" },
] as const;
export type Lang = (typeof LANGS)[number]["code"];

const saved = localStorage.getItem("lang");
const initial: Lang = saved === "en" || saved === "zh" ? saved : "mn";

void i18n.use(initReactI18next).init({
  resources: {
    mn: { translation: mn },
    en: { translation: en },
    zh: { translation: zh },
  },
  lng: initial,
  fallbackLng: "mn",
  interpolation: { escapeValue: false }, // React өөрөө escape хийдэг
});

/** Хэл солих + localStorage-д хадгалах. useTranslation-тэй компонентууд автоматаар шинэчлэгдэнэ. */
export function setLang(code: Lang) {
  localStorage.setItem("lang", code);
  void i18n.changeLanguage(code);
}

export default i18n;
