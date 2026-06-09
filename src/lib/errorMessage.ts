/**
 * Дурын алдаанаас хүний уншихуйц мессеж гаргана.
 * Supabase/PostgREST алдаа нь `Error` биш энгийн объект ({ message, details,
 * hint, code }) тул `String(err)` нь "[object Object]" болдог — үүнийг засна.
 */
export function errorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  if (e && typeof e === "object") {
    const o = e as Record<string, unknown>;
    if (typeof o.message === "string" && o.message) {
      const extra = [o.details, o.hint].filter(
        (x): x is string => typeof x === "string" && x.length > 0
      );
      return [o.message, ...extra].join(" — ");
    }
    try {
      return JSON.stringify(e);
    } catch {
      return String(e);
    }
  }
  return String(e);
}
