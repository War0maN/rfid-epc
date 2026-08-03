// ============================================================
// Хөдөлгөөний тайлангийн бүлэглэлт/үнэлгээ. Томьёо:
//   Эхний + Орлого − Зарлага = Эцсийн; орлого = шинэ + буцаалт,
//   зарлага = борлуулалт + актлалт. Үнэ/өртөггүй бараа дүнд 0-ээр
//   орж, ширхэг нь тусад нь тоологдоно (шар анхааруулгад).
// ============================================================
import { describe, it, expect } from "vitest";
import { groupMovement, type MovementRow } from "./movement";
import { product, productMap } from "../test/fixtures";

const row = (over: Partial<MovementRow> & { product_id: string }): MovementRow => ({
  opening: 0,
  in_new: 0,
  in_return: 0,
  out_sold: 0,
  out_writeoff: 0,
  closing: 0,
  ...over,
});

describe("groupMovement — бараагаар", () => {
  const products = productMap(product({ id: "p1", name: "Цамц", sku: "SH-1", price: 50000, cost: 30000 }));

  it("орлого/зарлагыг нэгтгэж, хоёр үнэлгээгээр тооцно", () => {
    const [g] = groupMovement(
      [row({ product_id: "p1", opening: 10, in_new: 5, in_return: 2, out_sold: 3, out_writeoff: 1, closing: 13 })],
      "product",
      products
    );
    expect(g.label).toBe("Цамц");
    expect(g.sub).toBe("SH-1");
    expect(g.opening).toBe(10);
    expect(g.inQty).toBe(7); // 5 шинэ + 2 буцаалт
    expect(g.outQty).toBe(4); // 3 борлуулалт + 1 актлалт
    expect(g.closing).toBe(13);
    expect(g.openingCost).toBe(300000);
    expect(g.inCost).toBe(210000);
    expect(g.outCost).toBe(120000);
    expect(g.closingCost).toBe(390000);
    expect(g.openingRetail).toBe(500000);
    expect(g.closingRetail).toBe(650000);
    expect(g.noCostQty).toBe(0);
    expect(g.noPriceQty).toBe(0);
  });

  it("нэг барааны олон мөрийг нэмнэ (жишээ нь салбараар задарсан)", () => {
    const [g] = groupMovement(
      [
        row({ product_id: "p1", opening: 4, closing: 4 }),
        row({ product_id: "p1", opening: 6, in_new: 1, closing: 7 }),
      ],
      "product",
      products
    );
    expect(g.opening).toBe(10);
    expect(g.inQty).toBe(1);
    expect(g.closing).toBe(11);
  });

  it("өртөггүй бараа дүнд 0-ээр орж, ширхэг нь тусад нь тоологдоно", () => {
    const noCost = productMap(product({ id: "p1", name: "Оймс", price: 5000, cost: null }));
    const [g] = groupMovement([row({ product_id: "p1", opening: 2, closing: 8 })], "product", noCost);
    expect(g.closingCost).toBe(0);
    expect(g.noCostQty).toBe(8); // эцсийн үлдэгдлийн ширхэг
    expect(g.closingRetail).toBe(40000);
    expect(g.noPriceQty).toBe(0);
  });

  it("зарах үнэгүй бараа мөн адил", () => {
    const noPrice = productMap(product({ id: "p1", name: "Тууз", price: null, cost: 100 }));
    const [g] = groupMovement([row({ product_id: "p1", closing: 3 })], "product", noPrice);
    expect(g.closingRetail).toBe(0);
    expect(g.noPriceQty).toBe(3);
    expect(g.closingCost).toBe(300);
  });

  it("бүртгэлгүй бараанд ч эвдрэхгүй (нэргүй гэж харагдана)", () => {
    const [g] = groupMovement([row({ product_id: "хачин", closing: 1 })], "product", new Map());
    expect(g.closing).toBe(1);
    expect(g.label.length).toBeGreaterThan(0);
    expect(g.noCostQty).toBe(1);
  });
});

describe("groupMovement — ангиллаар", () => {
  const products = productMap(
    product({ id: "p1", name: "Цамц", category_l1: "Хувцас", cost: 100, price: 200 }),
    product({ id: "p2", name: "Хүрэм", category_l1: "Хувцас", cost: 100, price: 200 }),
    product({ id: "p3", name: "Аяга", category_l1: null, cost: 100, price: 200 })
  );

  it("нэг ангиллын бараануудыг нэгтгэнэ", () => {
    const out = groupMovement(
      [
        row({ product_id: "p1", closing: 2 }),
        row({ product_id: "p2", closing: 3 }),
        row({ product_id: "p3", closing: 1 }),
      ],
      "category",
      products
    );
    const clothes = out.find((g) => g.key === "Хувцас");
    expect(clothes?.closing).toBe(5);
    expect(clothes?.closingCost).toBe(500);
    expect(out.find((g) => g.key === "__none__")?.closing).toBe(1);
  });

  it("өртгийн дүнгээр буурах эрэмбэтэй", () => {
    const out = groupMovement(
      [row({ product_id: "p3", closing: 1 }), row({ product_id: "p1", closing: 9 })],
      "category",
      products
    );
    expect(out.map((g) => g.key)).toEqual(["Хувцас", "__none__"]);
  });
});
