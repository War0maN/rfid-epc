// ============================================================
// Тооны форматын туслахууд — үнэ/тоог мянгатын таслалтай харуулна.
// CSV export-ууд ТҮҮХИЙ тоог хэвээр хадгална (Excel-д тоо гэж танигдана).
// ============================================================

/** Мянгатын таслалтай тоо: 1500000 → "1,500,000". null/хоосон → "". */
export function formatMoney(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "";
  return n.toLocaleString("en-US");
}

/** Таслалтай бичвэрээс тоо руу: "1,500,000" → 1500000. Хоосон → null. */
export function parseMoney(s: string): number | null {
  const digits = s.replace(/[^0-9]/g, "");
  if (!digits) return null;
  const n = Number(digits);
  return Number.isFinite(n) ? n : null;
}
