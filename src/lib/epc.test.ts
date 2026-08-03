// ============================================================
// EPC кодлол/задлалт — системийн ХАМГИЙН эмзэг цэвэр логик. Энд алдаа
// гарвал таг буруу кодлогдож, тооллого/хүлээн авалтад дутуу тоологдоно
// (бодит жишээ: 12 оронтой UPC "888…"-ийг 14 болгож гүйцээгээгүйгээс
// C5 апп дээр таг тулгагдахгүй байсан — доорх normalizeGtin-ий тестүүд
// яг тэр ангиллынх).
// ============================================================
import { describe, it, expect } from "vitest";
import {
  buildIndicatorItemRef,
  DEFAULT_GCP_LENGTH,
  epcHexToTagUri,
  epcHexToUri,
  gid96Batch,
  gid96Decode,
  gid96Encode,
  gid96HexToUri,
  gtinCheckDigit,
  normalizeEpc,
  normalizeGtin,
  sgtin96Batch,
  sgtin96BatchFromGtin,
  sgtin96Decode,
  sgtin96Encode,
  sgtin96FromGtin,
  sgtin96HexToTagUri,
  sgtin96HexToUri,
} from "./epc";

// GS1 EPC Tag Data Standard-ийн албан ёсны жишээ (файлын толгойд бичсэн).
const GS1_REF_HEX = "3074257BF7194E4000001A85";
const GS1_REF = {
  filter: 3,
  companyPrefix: "0614141",
  indicatorItemRef: "812345",
  serial: 6789,
};

describe("gtinCheckDigit", () => {
  it("GS1-ийн жишээ баркодуудын хяналтын оронг зөв тооцоолно", () => {
    expect(gtinCheckDigit("0614141812345")).toBe(6);
    expect(gtinCheckDigit("501234567890")).toBe(0); // EAN-13 (12 орон + check)
    expect(gtinCheckDigit("400638133393")).toBe(1);
  });

  it("тоо биш тэмдэгтийг үл тооно", () => {
    expect(gtinCheckDigit("0614-141 812345")).toBe(gtinCheckDigit("0614141812345"));
  });
});

describe("normalizeGtin", () => {
  it("EAN-13-ыг 14 орон болгож тэгээр гүйцээнэ", () => {
    expect(normalizeGtin("4006381333931")).toBe("04006381333931");
  });

  it("12 оронтой UPC-г 14 орон болгоно (C5 дээрх дутуу тоололтын шалтгаан)", () => {
    // "888462079143" (UPC-A) → "00888462079143". Гүйцээхгүй бол сервер талын
    // GTIN-14-тэй тулгалт таарахгүй болж таг "олдоогүй" гэж гарна.
    expect(normalizeGtin("888462079143")).toBe("00888462079143");
  });

  it("аль хэдийн 14 оронтой GTIN-г хэвээр буцаана", () => {
    expect(normalizeGtin("00888462079143")).toBe("00888462079143");
  });

  it("EAN-8-г хүлээн авна", () => {
    expect(normalizeGtin("96385074")).toBe("00000096385074");
  });

  it("зай/зураас зэрэг тэмдэгтийг цэвэрлэнэ", () => {
    expect(normalizeGtin(" 4006381-333931 ")).toBe("04006381333931");
  });

  it("хяналтын орон буруу бол алдаа шиднэ", () => {
    expect(() => normalizeGtin("4006381333930")).toThrow();
  });

  it("хэт богино/урт баркодыг татгалзана", () => {
    expect(() => normalizeGtin("1234567")).toThrow();
    expect(() => normalizeGtin("123456789012345")).toThrow();
  });
});

describe("buildIndicatorItemRef", () => {
  it("indicator + тэгээр гүйцээсэн item reference болгоно", () => {
    expect(buildIndicatorItemRef(7, 0, "12345")).toBe("012345");
    expect(buildIndicatorItemRef(9, 1, "7")).toBe("1007");
  });

  it("company prefix 12 орон үед зөвхөн indicator үлдэнэ", () => {
    expect(buildIndicatorItemRef(12, 0, "")).toBe("0");
  });

  it("item reference багтахгүй бол алдаа шиднэ", () => {
    expect(() => buildIndicatorItemRef(9, 0, "12345")).toThrow();
  });

  it("indicator 0–9-ийн гадна бол алдаа шиднэ", () => {
    expect(() => buildIndicatorItemRef(7, 10, "1")).toThrow();
  });
});

describe("sgtin96Encode / sgtin96Decode", () => {
  it("GS1-ийн лавлагаа жишээг яг кодлоно", () => {
    expect(
      sgtin96Encode({
        companyPrefix: GS1_REF.companyPrefix,
        indicatorItemRef: GS1_REF.indicatorItemRef,
        serial: GS1_REF.serial,
        filter: GS1_REF.filter,
      })
    ).toBe(GS1_REF_HEX);
  });

  it("лавлагаа жишээг буцааж задална", () => {
    expect(sgtin96Decode(GS1_REF_HEX)).toEqual({
      filter: 3,
      partition: 5,
      companyPrefix: "0614141",
      indicatorItemRef: "812345",
      serial: "6789",
    });
  });

  it("гаралт үргэлж 24 тэмдэгтийн том үсэгтэй hex", () => {
    const hex = sgtin96Encode({ companyPrefix: "0614141", indicatorItemRef: "000000", serial: 0 });
    expect(hex).toMatch(/^[0-9A-F]{24}$/);
  });

  it("serial 38 битийн дээд хязгаарыг хүлээж авч, давбал татгалзана", () => {
    const max = (1n << 38n) - 1n;
    const base = { companyPrefix: "0614141", indicatorItemRef: "812345" };
    expect(sgtin96Decode(sgtin96Encode({ ...base, serial: max })).serial).toBe(max.toString());
    expect(() => sgtin96Encode({ ...base, serial: max + 1n })).toThrow();
    expect(() => sgtin96Encode({ ...base, serial: -1 })).toThrow();
  });

  it("company prefix-ийн урт 6–12-ын гадна бол татгалзана", () => {
    expect(() => sgtin96Encode({ companyPrefix: "12345", indicatorItemRef: "1", serial: 1 })).toThrow();
    expect(() =>
      sgtin96Encode({ companyPrefix: "1234567890123", indicatorItemRef: "1", serial: 1 })
    ).toThrow();
  });

  it("indicatorItemRef-ийн орон нь prefix-ийн уртад таарахгүй бол татгалзана", () => {
    expect(() =>
      sgtin96Encode({ companyPrefix: "0614141", indicatorItemRef: "12345", serial: 1 })
    ).toThrow();
  });

  it("filter 0–7-ын гадна бол татгалзана", () => {
    expect(() =>
      sgtin96Encode({ companyPrefix: "0614141", indicatorItemRef: "812345", serial: 1, filter: 8 })
    ).toThrow();
  });

  it("SGTIN биш header-тэй hex-г задлахаас татгалзана", () => {
    expect(() => sgtin96Decode("350000001000002000000003")).toThrow(); // GID-96
  });
});

describe("sgtin96FromGtin — GTIN ↔ EPC эргэх хөрвүүлэлт", () => {
  // Кодын үндсэн таамаглал: хуваалт (GCP урт) ямар ч байсан
  // companyPrefix ⧺ indicatorItemRef нь ИЖИЛ GTIN-г сэргээнэ.
  const rebuildGtin13 = (hex: string) => {
    const { companyPrefix, indicatorItemRef } = sgtin96Decode(hex);
    return indicatorItemRef[0] + companyPrefix + indicatorItemRef.slice(1);
  };

  it("6–12 хүртэлх бүх GCP уртад ижил GTIN-г сэргээнэ", () => {
    const gtin14 = normalizeGtin("4006381333931");
    for (let gcp = 6; gcp <= 12; gcp++) {
      const hex = sgtin96FromGtin(gtin14, 42, 1, gcp);
      const g13 = rebuildGtin13(hex);
      expect(`${g13}${gtinCheckDigit(g13)}`, `GCP=${gcp}`).toBe(gtin14);
      expect(sgtin96Decode(hex).serial, `GCP=${gcp}`).toBe("42");
    }
  });

  it("12 оронтой UPC-г 14 болгосны дараа кодлоно", () => {
    const hex = sgtin96FromGtin("888462079143", 1);
    const g13 = rebuildGtin13(hex);
    expect(`${g13}${gtinCheckDigit(g13)}`).toBe("00888462079143");
  });

  it("default GCP урт нь 7 (хуваалтын дугаар 5)", () => {
    expect(DEFAULT_GCP_LENGTH).toBe(7);
    expect(sgtin96Decode(sgtin96FromGtin("4006381333931", 1)).partition).toBe(5);
  });

  it("баркод хүчингүй бол EPC үүсгэхгүй", () => {
    expect(() => sgtin96FromGtin("4006381333930", 1)).toThrow();
  });
});

describe("багц үүсгэлт (serial дараалал)", () => {
  it("sgtin96Batch дараалсан serial-аар давтагдалгүй EPC өгнө", () => {
    const batch = sgtin96Batch(
      { companyPrefix: "0614141", indicatorItemRef: "812345" },
      1000,
      5
    );
    expect(batch).toHaveLength(5);
    expect(batch.map((b) => b.serial)).toEqual([1000n, 1001n, 1002n, 1003n, 1004n]);
    expect(new Set(batch.map((b) => b.epcHex)).size).toBe(5);
    batch.forEach((b) => expect(sgtin96Decode(b.epcHex).serial).toBe(b.serial.toString()));
  });

  it("sgtin96BatchFromGtin мөн адил (баркодоос)", () => {
    const batch = sgtin96BatchFromGtin("4006381333931", 7n, 3);
    expect(batch.map((b) => b.serial)).toEqual([7n, 8n, 9n]);
    expect(new Set(batch.map((b) => b.epcHex)).size).toBe(3);
  });

  it("count = 0 бол хоосон массив", () => {
    expect(sgtin96Batch({ companyPrefix: "0614141", indicatorItemRef: "812345" }, 1, 0)).toEqual([]);
  });

  it("gid96Batch дараалсан serial-аар өгнө", () => {
    const batch = gid96Batch({ managerNumber: 5, objectClass: 9 }, 100, 3);
    expect(batch.map((b) => b.serial)).toEqual([100n, 101n, 102n]);
    expect(gid96Decode(batch[2].epcHex)).toEqual({
      managerNumber: "5",
      objectClass: "9",
      serial: "102",
    });
  });
});

describe("normalizeEpc", () => {
  it("зай/цэг/зураас/тодорхойлогчийг цэвэрлэж том үсэг болгоно", () => {
    expect(normalizeEpc("30 74 25 7b f7 19 4e 40 00 00 1a 85")).toBe(GS1_REF_HEX);
    expect(normalizeEpc("3074257b-f719-4e40-0000-1a85")).toBe(GS1_REF_HEX);
  });

  it("24 тэмдэгт hex биш бол алдаа шиднэ", () => {
    expect(() => normalizeEpc("3074257BF7194E4000001A8")).toThrow(); // 23 тэмдэгт
    expect(() => normalizeEpc("3074257BF7194E4000001A8Z")).toThrow(); // hex биш
    expect(() => normalizeEpc("")).toThrow();
  });
});

describe("GID-96 (баркодгүй бараа)", () => {
  it("кодлоод буцааж задлахад ижил утга гарна", () => {
    const hex = gid96Encode({ managerNumber: 268435455, objectClass: 16777215, serial: 68719476735n });
    expect(hex).toMatch(/^[0-9A-F]{24}$/);
    expect(gid96Decode(hex)).toEqual({
      managerNumber: "268435455",
      objectClass: "16777215",
      serial: "68719476735",
    });
  });

  it("талбар бүр нибблд тэгширдэг тул hex-ээр шууд уншигдана", () => {
    expect(gid96Encode({ managerNumber: 1, objectClass: 2, serial: 3 })).toBe(
      "350000001000002000000003"
    );
  });

  it("талбарын хязгаараас хэтэрвэл татгалзана", () => {
    expect(() => gid96Encode({ managerNumber: 1n << 28n, objectClass: 1, serial: 1 })).toThrow();
    expect(() => gid96Encode({ managerNumber: 1, objectClass: 1n << 24n, serial: 1 })).toThrow();
    expect(() => gid96Encode({ managerNumber: 1, objectClass: 1, serial: 1n << 36n })).toThrow();
    expect(() => gid96Encode({ managerNumber: -1, objectClass: 1, serial: 1 })).toThrow();
  });

  it("GID биш header-тэй hex-г задлахаас татгалзана", () => {
    expect(() => gid96Decode(GS1_REF_HEX)).toThrow();
  });
});

describe("URI хувиргалт", () => {
  it("SGTIN-96 → Pure Identity / Tag URI", () => {
    expect(sgtin96HexToUri(GS1_REF_HEX)).toBe("urn:epc:id:sgtin:0614141.812345.6789");
    expect(sgtin96HexToTagUri(GS1_REF_HEX)).toBe("urn:epc:tag:sgtin-96:3.0614141.812345.6789");
  });

  it("GID-96 → Pure Identity URI", () => {
    expect(gid96HexToUri("350000001000002000000003")).toBe("urn:epc:id:gid:1.2.3");
  });

  it("epcHexToUri нь header-ээр төрлийг өөрөө таньдаг", () => {
    expect(epcHexToUri(GS1_REF_HEX)).toBe("urn:epc:id:sgtin:0614141.812345.6789");
    expect(epcHexToUri("350000001000002000000003")).toBe("urn:epc:id:gid:1.2.3");
    expect(epcHexToTagUri("350000001000002000000003")).toBe("urn:epc:tag:gid-96:1.2.3");
  });

  it("дэмжигдээгүй header-т ойлгомжтой алдаа өгнө", () => {
    expect(() => epcHexToUri("2F0000000000000000000000")).toThrow();
    expect(() => epcHexToTagUri("2F0000000000000000000000")).toThrow();
  });
});
