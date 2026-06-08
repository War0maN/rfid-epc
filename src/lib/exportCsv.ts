// CSV export туслах — мөр/баганаас CSV текст үүсгэж, файл болгож татна.

/** Нэг утгыг CSV талбар болгож escape хийнэ (хашилт, таслал, мөр шилжилт). */
function escapeCell(value: unknown): string {
  const s = value == null ? "" : String(value);
  if (/[",\n\r]/.test(s)) {
    return '"' + s.replace(/"/g, '""') + '"';
  }
  return s;
}

/**
 * Объектын массивыг CSV болгож хувиргана.
 * columns: { key, label } — гаралтын багана ба гарчгийн дараалал.
 */
export function toCsv<T extends Record<string, unknown>>(
  rows: T[],
  columns: { key: keyof T; label: string }[]
): string {
  const header = columns.map((c) => escapeCell(c.label)).join(",");
  const body = rows
    .map((row) => columns.map((c) => escapeCell(row[c.key])).join(","))
    .join("\r\n");
  return header + "\r\n" + body;
}

/** CSV текстийг файл болгож browser-ээр татуулна. */
export function downloadCsv(filename: string, csv: string): void {
  // Excel-д кирилл/UTF-8 зөв нээгдэхийн тулд BOM нэмнэ.
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
