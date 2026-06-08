import { createClient } from "@supabase/supabase-js";

// .env (Vite): VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY
const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  throw new Error(
    "Supabase тохиргоо дутуу байна. Төслийн язгуурт .env файл үүсгээд " +
      "VITE_SUPABASE_URL ба VITE_SUPABASE_ANON_KEY-г бөглөнө үү (.env.example-г харна уу)."
  );
}

export const supabase = createClient(url, anonKey);
