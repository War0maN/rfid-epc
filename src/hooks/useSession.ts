import { useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../lib/supabaseClient";

/**
 * Supabase auth session-г сонсох hook.
 * loading=true байх үед эхний session шалгалт дуусаагүй гэсэн үг.
 * recovery=true — нууц үг сэргээх холбоосоор орж ирсэн (шинэ нууц үг тавиулна).
 */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [recovery, setRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next);
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return { session, loading, recovery, clearRecovery: () => setRecovery(false) };
}
