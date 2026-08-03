import { describe, it, expect } from "vitest";
import { formatMoney, parseMoney } from "./format";

describe("formatMoney", () => {
  it("мянгатын таслал тавина", () => {
    expect(formatMoney(1500000)).toBe("1,500,000");
    expect(formatMoney(999)).toBe("999");
  });

  it("0-ийг ХООСОН болгохгүй (тайланд үнэгүй бараа 0-ээр харагдана)", () => {
    expect(formatMoney(0)).toBe("0");
  });

  it("сөрөг тоог хэвээр форматлана", () => {
    expect(formatMoney(-2500)).toBe("-2,500");
  });

  it("null/undefined/тоо биш утгыг хоосон мөр болгоно", () => {
    expect(formatMoney(null)).toBe("");
    expect(formatMoney(undefined)).toBe("");
    expect(formatMoney(NaN)).toBe("");
    expect(formatMoney(Infinity)).toBe("");
  });
});

describe("parseMoney", () => {
  it("таслалтай бичвэрээс тоо гаргана", () => {
    expect(parseMoney("1,500,000")).toBe(1500000);
  });

  it("валютын тэмдэг/зайг үл тооно", () => {
    expect(parseMoney("₮ 12 500")).toBe(12500);
  });

  it("хоосон буюу цифргүй бичвэрт null", () => {
    expect(parseMoney("")).toBe(null);
    expect(parseMoney("   ")).toBe(null);
    expect(parseMoney("abc")).toBe(null);
  });

  it("0-ийг зөв уншина (null биш)", () => {
    expect(parseMoney("0")).toBe(0);
  });

  it("аравтын таслалыг ДЭМЖДЭГГҮЙ — үнэ бүхэл тоогоор (₮)", () => {
    // Хэрэв ирээдүйд бутархай үнэ дэмжих бол энэ тест анхааруулна.
    expect(parseMoney("1.5")).toBe(15);
    expect(parseMoney("-500")).toBe(500);
  });
});
