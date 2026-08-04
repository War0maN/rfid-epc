// ============================================================
// Шилжүүлгийн даалгаврын жагсаалтыг Excel-ээс (Шат 2б, 2026-08-05).
//   Хүлээн авалтын packing list уншигчийг (parsePackingRows — толгойн
//   MN/EN/ZH synonym, sheet сонголт) хуваалцана. Гол ялгаа: бараа
//   ҮҮСГЭХГҮЙ — зөвхөн БАЙГАА бараатай тулгана (даалгавар шинэ бараа
//   бүртгэх газар биш). Таарахгүй мөр unmatched гэж буцна.
//   Тулгах дараалал: GTIN (нормчилсон 14 орон) → SKU → нэр (яг таарах).
// ============================================================
import { parsePackingRows, type CleanRow } from "./importPackingList";

/** Тулгалтад хэрэгтэй барааны талбарууд (ProductRow-ийн дэд олонлог). */
export interface MatchProduct {
  id: string;
  gtin: string | null;
  sku: string | null;
  name: string | null;
}

export interface JobLinesResult {
  /** Даалгаврын мөрүүд (нэг бараа нэг мөр, тоо нэгтгэгдсэн). */
  lines: { product_id: string; qty: number }[];
  totalQty: number;
  /** Системд бүртгэлгүй (таараагүй) мөрийн тайлбарууд. */
  unmatched: string[];
  /** Уншигдаагүй мөрүүд (parsePackingRows-ийн skipped — баркод буруу г.м.). */
  skipped: string[];
}

/**
 * Задалсан мөрүүдийг байгаа бараатай тулгана (цэвэр функц — тестлэгдэнэ).
 * Ижил бараанд таарсан олон мөрийн тоо нэгтгэгдэнэ.
 */
export function matchJobLines(
  rows: Pick<CleanRow, "gtin" | "sku" | "name" | "piece">[],
  products: MatchProduct[]
): Omit<JobLinesResult, "skipped"> {
  const byGtin = new Map<string, string>();
  const bySku = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const p of products) {
    if (p.gtin) byGtin.set(p.gtin.trim(), p.id);
    if (p.sku?.trim()) bySku.set(p.sku.trim().toLowerCase(), p.id);
    if (p.name?.trim()) byName.set(p.name.trim().toLowerCase(), p.id);
  }

  const qty = new Map<string, number>();
  const unmatched: string[] = [];
  for (const r of rows) {
    const pid =
      (r.gtin ? byGtin.get(r.gtin) : undefined) ??
      (r.sku ? bySku.get(r.sku.trim().toLowerCase()) : undefined) ??
      (r.name ? byName.get(r.name.trim().toLowerCase()) : undefined);
    if (!pid) {
      unmatched.push([r.name, r.sku, r.gtin].filter(Boolean).join(" · ") || "?");
      continue;
    }
    qty.set(pid, (qty.get(pid) ?? 0) + r.piece);
  }

  const lines = [...qty.entries()].map(([product_id, q]) => ({ product_id, qty: q }));
  return {
    lines,
    totalQty: lines.reduce((s, l) => s + l.qty, 0),
    unmatched,
  };
}

/** Excel файлаас даалгаврын жагсаалт бэлтгэнэ (бараа үүсгэхгүй, зөвхөн тулгана). */
export async function parseJobLinesFile(
  file: Blob,
  products: MatchProduct[]
): Promise<JobLinesResult> {
  const { rows, skipped } = await parsePackingRows(file);
  return { ...matchJobLines(rows, products), skipped };
}
