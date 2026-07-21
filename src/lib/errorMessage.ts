import i18n from "../i18n";

/**
 * Дурын алдаанаас хүний уншихуйц мессеж гаргана.
 * Supabase/PostgREST алдаа нь `Error` биш энгийн объект ({ message, details,
 * hint, code }) тул `String(err)` нь "[object Object]" болдог — үүнийг засна.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return friendly(e.message);
  if (typeof e === "string") return friendly(e);
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) {
      const extra = [o.details, o.hint].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      return friendly([o.message, ...extra].join(" — "));
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}

/** Supabase/Postgres-ийн түгээмэл түүхий мессежүүдийг идэвхтэй хэлээр найрсаг болгоно. */
function friendly(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("email rate limit exceeded")) return i18n.t("errors.emailRateLimit");
  if (m.includes("invalid login credentials")) return i18n.t("errors.invalidCredentials");
  // Ажлын дугаар давхцсан (unique tenant_id+job_number) — constraint нэрээр танина.
  if (m.includes("jobs_tenant_id_job_number_key")) return i18n.t("errors.jobNumberDuplicate");
  return msg;
}
