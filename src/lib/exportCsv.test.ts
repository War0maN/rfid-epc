import { describe, it, expect } from "vitest";
import { toCsv } from "./exportCsv";

// downloadCsv нь DOM-той тул энд тестлэхгүй — CSV-ийн БҮТЭЦ бүхэлдээ toCsv-д.
describe("toCsv", () => {
  const cols = [
    { key: "name" as const, label: "Нэр" },
    { key: "qty" as const, label: "Тоо" },
  ];

  it("толгой + мөрүүдийг CRLF-ээр залгана", () => {
    const csv = toCsv([{ name: "Цамц", qty: 3 }], cols);
    expect(csv).toBe("Нэр,Тоо\r\nЦамц,3");
  });

  it("баганын дараалал/шошгыг өгсөн байдлаар нь баримтална", () => {
    const csv = toCsv([{ name: "A", qty: 1 }], [cols[1], cols[0]]);
    expect(csv.split("\r\n")[0]).toBe("Тоо,Нэр");
    expect(csv.split("\r\n")[1]).toBe("1,A");
  });

  it("таслал, хашилт, мөр шилжилттэй утгыг escape хийнэ", () => {
    const csv = toCsv(
      [{ name: 'Цамц, "цэнхэр"', qty: "мөр1\nмөр2" }],
      cols
    );
    expect(csv).toBe('Нэр,Тоо\r\n"Цамц, ""цэнхэр""","мөр1\nмөр2"');
  });

  it("null/undefined утгыг хоосон нүд болгоно", () => {
    expect(toCsv([{ name: null, qty: undefined }], cols)).toBe("Нэр,Тоо\r\n,");
  });

  it("тоог ТҮҮХИЙ хэвээр гаргана (Excel тоо гэж таних ёстой)", () => {
    // Мянгатын таслал энд ОРОХГҮЙ — форматлалт зөвхөн дэлгэцэд.
    expect(toCsv([{ name: "x", qty: 1500000 }], cols)).toContain(",1500000");
  });

  it("мөргүй үед зөвхөн толгой гарна", () => {
    expect(toCsv([], cols)).toBe("Нэр,Тоо\r\n");
  });
});
