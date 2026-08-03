// Тестийн туслах фикстурууд (тест файл БИШ — include загварт орохгүй).
import type { ProductRow } from "../lib/products";

/** Бүрэн ProductRow — зөвхөн хэрэгтэй талбараа дарж бичнэ. */
export function product(over: Partial<ProductRow> & { id: string }): ProductRow {
  return {
    name: "Бараа",
    sku: null,
    gtin: null,
    price: null,
    cost: null,
    category_id: null,
    category_l1: null,
    category_l2: null,
    category_l3: null,
    attributes: {},
    epc_count: 0,
    active_count: 0,
    created_at: "2026-01-01T00:00:00Z",
    ...over,
  };
}

/** id → ProductRow map (тайлангийн бүлэглэгчид ийм хэлбэрээр авдаг). */
export function productMap(...rows: ProductRow[]): Map<string, ProductRow> {
  return new Map(rows.map((p) => [p.id, p]));
}
