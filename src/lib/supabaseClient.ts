import { createClient } from "@supabase/supabase-js";
import i18n from "../i18n";

// .env (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(i18n.t("errors.supabaseConfigMissing"));
}

export const supabase = createClient(url, anonKey);
