// ============================================================
// Даалгаврын Excel жагсаалтын тулгагч. Дүрэм: бараа ҮҮСГЭХГҮЙ, зөвхөн
// байгаатай тулгана; дараалал GTIN → SKU → нэр; давхардсан мөр нэгтгэгдэнэ.
// ============================================================
import { describe, it, expect } from "vitest";
import { matchJobLines, type MatchProduct } from "./importJobLines";

const products: MatchProduct[] = [
  { id: "p1", gtin: "04068822750219", sku: "KE8470-OSFW", name: "Pillow" },
  { id: "p2", gtin: null, sku: "SH-1", name: "Цамц" },
  { id: "p3", gtin: null, sku: null, name: "Оймс" },
];

const row = (over: Partial<{ gtin: string | null; sku: string | null; name: string | null; piece: number }>) => ({
  gtin: null,
  sku: null,
  name: null,
  piece: 1,
  ...over,
});

describe("matchJobLines", () => {
  it("GTIN-ээр эхэлж тулгана (нэр өөр байсан ч)", () => {
    const r = matchJobLines([row({ gtin: "04068822750219", name: "Огт өөр нэр", piece: 3 })], products);
    expect(r.lines).toEqual([{ product_id: "p1", qty: 3 }]);
    expect(r.unmatched).toEqual([]);
  });

  it("GTIN байхгүй бол SKU-гаар (том/жижиг үсэг ялгахгүй)", () => {
    const r = matchJobLines([row({ sku: "sh-1", piece: 2 })], products);
    expect(r.lines).toEqual([{ product_id: "p2", qty: 2 }]);
  });

  it("сүүлд нэрээр (яг таарах, том/жижиг ялгахгүй)", () => {
    const r = matchJobLines([row({ name: "оймс", piece: 5 })], products);
    expect(r.lines).toEqual([{ product_id: "p3", qty: 5 }]);
  });

  it("нэг бараанд таарсан олон мөрийн тоо нэгтгэгдэнэ", () => {
    const r = matchJobLines(
      [
        row({ gtin: "04068822750219", piece: 2 }),
        row({ sku: "KE8470-OSFW", piece: 3 }),
        row({ name: "Pillow", piece: 1 }),
      ],
      products
    );
    expect(r.lines).toEqual([{ product_id: "p1", qty: 6 }]);
    expect(r.totalQty).toBe(6);
  });

  it("таарахгүй мөр unmatched-д ойлгомжтой тайлбартай орно", () => {
    const r = matchJobLines(
      [row({ name: "Байхгүй бараа", sku: "X-9", piece: 4 }), row({ gtin: "00000096385074", piece: 1 })],
      products
    );
    expect(r.lines).toEqual([]);
    expect(r.unmatched).toHaveLength(2);
    expect(r.unmatched[0]).toContain("Байхгүй бараа");
    expect(r.unmatched[0]).toContain("X-9");
    expect(r.unmatched[1]).toContain("00000096385074");
  });

  it("бараа ҮҮСГЭДЭГГҮЙ — unmatched нь зөвхөн мэдээлэл", () => {
    // (Импортын parseAndUpsertProducts-аас ялгаатай нь энд ямар ч бичилт
    // байхгүй гэдгийг баталгаажуулах утгын тест: гаралт зөвхөн lines/unmatched.)
    const r = matchJobLines([row({ name: "Шинэ бараа", piece: 9 })], products);
    expect(Object.keys(r).sort()).toEqual(["lines", "totalQty", "unmatched"]);
  });

  it("хоосон оролтод хоосон үр дүн", () => {
    const r = matchJobLines([], products);
    expect(r.lines).toEqual([]);
    expect(r.totalQty).toBe(0);
  });
});
