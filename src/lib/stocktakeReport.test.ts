// ============================================================
// Тооллогын зөрүүгийн бүлэглэлт. Дутуу = бүртгэлтэй − тоологдсон;
// алдагдлын дүн = дутуу × барааны ОДООГИЙН үнэ.
// ============================================================
import { describe, it, expect } from "vitest";
import { groupStocktake, type StocktakeRow, type StocktakeMaps } from "./stocktakeReport";
import { product, productMap } from "../test/fixtures";

const row = (over: Partial<StocktakeRow> & { product_id: string }): StocktakeRow => ({
  stocktake_id: "st1",
  number: "ST-0001",
  branch_id: "b1",
  closed_at: "2026-03-15T10:00:00Z",
  expected: 0,
  found: 0,
  extra: 0,
  ...over,
});

const maps: StocktakeMaps = {
  branchName: new Map([
    ["b1", "Төв салбар"],
    ["b2", "Салбар 2"],
  ]),
  products: productMap(
    product({ id: "p1", name: "Цамц", sku: "SH-1", price: 50000 }),
    product({ id: "p2", name: "Оймс", price: null })
  ),
};

describe("groupStocktake", () => {
  it("дутуу = бүртгэлтэй − тоологдсон, дүн нь одоогийн үнээр", () => {
    const [g] = groupStocktake(
      [row({ product_id: "p1", expected: 10, found: 7, extra: 1 })],
      "product",
      maps
    );
    expect(g.expected).toBe(10);
    expect(g.found).toBe(7);
    expect(g.missing).toBe(3);
    expect(g.extra).toBe(1);
    expect(g.missingValue).toBe(150000);
    expect(g.noPriceMissing).toBe(0);
    expect(g.sub).toBe("SH-1");
  });

  it("үнэгүй барааны дутуу дүнд ороогүй, тусад нь тоологдоно", () => {
    const [g] = groupStocktake([row({ product_id: "p2", expected: 5, found: 1 })], "product", maps);
    expect(g.missing).toBe(4);
    expect(g.missingValue).toBe(0);
    expect(g.noPriceMissing).toBe(4);
  });

  it("бүрэн тоологдсон бол дутуу 0 (сөрөг болохгүй)", () => {
    const [g] = groupStocktake([row({ product_id: "p1", expected: 4, found: 4 })], "product", maps);
    expect(g.missing).toBe(0);
    expect(g.missingValue).toBe(0);
  });

  it("тооллогоор бүлэглэхэд салбар + хаасан огноо дэд мөрөнд гарна", () => {
    const [g] = groupStocktake([row({ product_id: "p1", expected: 1 })], "stocktake", maps);
    expect(g.label).toBe("ST-0001");
    expect(g.sub).toBe("Төв салбар · 2026-03-15");
  });

  it("салбараар бүлэглэхэд олон тооллого нэгддэг", () => {
    const out = groupStocktake(
      [
        row({ product_id: "p1", expected: 10, found: 8 }),
        row({ stocktake_id: "st2", number: "ST-0002", product_id: "p1", expected: 5, found: 4 }),
        row({ stocktake_id: "st3", number: "ST-0003", branch_id: "b2", product_id: "p1", expected: 2, found: 0 }),
      ],
      "branch",
      maps
    );
    const center = out.find((g) => g.key === "b1");
    expect(center?.label).toBe("Төв салбар");
    expect(center?.missing).toBe(3);
    expect(center?.missingValue).toBe(150000);
    // Алдагдлын дүнгээр буурах эрэмбэ: b1 (150k) > b2 (100k)
    expect(out.map((g) => g.key)).toEqual(["b1", "b2"]);
  });

  it("сараар бүлэглэхэд түлхүүр YYYY-MM, өсөх эрэмбэтэй (график цаг хугацааны дараалалтай)", () => {
    const out = groupStocktake(
      [
        row({ product_id: "p1", closed_at: "2026-05-02T00:00:00Z", expected: 1, found: 0 }),
        row({ product_id: "p1", closed_at: "2026-01-20T00:00:00Z", expected: 9, found: 0 }),
      ],
      "month",
      maps
    );
    expect(out.map((g) => g.key)).toEqual(["2026-01", "2026-05"]);
  });

  it("салбар/бараа бүртгэлгүй байсан ч эвдрэхгүй", () => {
    const [g] = groupStocktake(
      [row({ product_id: "хачин", branch_id: "хачин", expected: 1 })],
      "branch",
      maps
    );
    expect(g.label).toBe("?");
    expect(g.noPriceMissing).toBe(1);
  });
});
