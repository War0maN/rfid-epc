// ============================================================
// SGTIN-96 EPC encoder / normalizer
// GS1 EPC Tag Data Standard. Гаралт нь 24 тэмдэгтийн hex.
// GS1 жишээ дээр шалгасан:
//   3.0614141.812345.6789  ->  3074257BF7194E4000001A85
// ============================================================

/** Company Prefix-ийн уртаар тодорхойлогдох partition хүснэгт. */
const PARTITION: Record<number, { partition: number; cpBits: number; refBits: number; refDigits: number }> = {
  12: { partition: 0, cpBits: 40, refBits: 4,  refDigits: 1 },
  11: { partition: 1, cpBits: 37, refBits: 7,  refDigits: 2 },
  10: { partition: 2, cpBits: 34, refBits: 10, refDigits: 3 },
  9:  { partition: 3, cpBits: 30, refBits: 14, refDigits: 4 },
  8:  { partition: 4, cpBits: 27, refBits: 17, refDigits: 5 },
  7:  { partition: 5, cpBits: 24, refBits: 20, refDigits: 6 },
  6:  { partition: 6, cpBits: 20, refBits: 24, refDigits: 7 },
};

/** Partition утгаар буцааж хайх (decode-д). cpDigits = 12 - partition, refDigits = 1 + partition. */
const PARTITION_BY_VALUE: Record<number, { cpBits: number; refBits: number; cpDigits: number; refDigits: number }> = {
  0: { cpBits: 40, refBits: 4,  cpDigits: 12, refDigits: 1 },
  1: { cpBits: 37, refBits: 7,  cpDigits: 11, refDigits: 2 },
  2: { cpBits: 34, refBits: 10, cpDigits: 10, refDigits: 3 },
  3: { cpBits: 30, refBits: 14, cpDigits: 9,  refDigits: 4 },
  4: { cpBits: 27, refBits: 17, cpDigits: 8,  refDigits: 5 },
  5: { cpBits: 24, refBits: 20, cpDigits: 7,  refDigits: 6 },
  6: { cpBits: 20, refBits: 24, cpDigits: 6,  refDigits: 7 },
};

const SGTIN96_HEADER = 0x30n;
const SERIAL_MAX = (1n << 38n) - 1n; // 274,877,906,943

function bits(value: bigint, len: number): string {
  const b = value.toString(2);
  if (b.length > len) throw new Error(`value ${value} exceeds ${len} bits`);
  return b.padStart(len, "0");
}

/**
 * Indicator + Item Reference талбарыг бүтээнэ.
 * Урт нь (13 - prefixLen) орон: [indicator(1)] + [itemReference, тэгээр гүйцээсэн].
 * Жишээ: prefixLen=7, indicator=0, itemReference="12345" -> "012345"
 */
export function buildIndicatorItemRef(prefixLen: number, indicator: number, itemReference: string): string {
  const itemDigits = 12 - prefixLen;
  if (itemDigits < 0) throw new Error(`prefix length ${prefixLen} invalid`);
  const ref = String(itemReference).replace(/\D/g, "");
  if (ref.length > itemDigits) {
    throw new Error(`item reference "${itemReference}" нь ${itemDigits} оронд багтахгүй (prefix len ${prefixLen})`);
  }
  if (indicator < 0 || indicator > 9) throw new Error("indicator нь 0-9 байх ёстой");
  return String(indicator) + ref.padStart(itemDigits, "0");
}

export interface Sgtin96Input {
  companyPrefix: string;     // GS1 угтвар, тэргүүлэх тэгийг хадгална (str)
  indicatorItemRef: string;  // buildIndicatorItemRef-ийн гаралт
  serial: bigint | number;
  filter?: number;           // default 1 (ширхэг бараа)
}

/** SGTIN-96 EPC-г 24 тэмдэгтийн hex болгож кодлоно. */
export function sgtin96Encode({ companyPrefix, indicatorItemRef, serial, filter = 1 }: Sgtin96Input): string {
  const cpLen = companyPrefix.length;
  const p = PARTITION[cpLen];
  if (!p) throw new Error(`Company prefix урт ${cpLen} буруу (6-12 байх ёстой)`);
  if (indicatorItemRef.length !== p.refDigits) {
    throw new Error(`indicatorItemRef нь ${p.refDigits} орон байх ёстой (prefix len ${cpLen})`);
  }
  if (filter < 0 || filter > 7) throw new Error("filter нь 0-7 байх ёстой");

  const s = BigInt(serial);
  if (s < 0n || s > SERIAL_MAX) throw new Error(`serial нь 0..${SERIAL_MAX} хооронд байх ёстой`);

  const binary =
    bits(SGTIN96_HEADER, 8) +
    bits(BigInt(filter), 3) +
    bits(BigInt(p.partition), 3) +
    bits(BigInt(companyPrefix), p.cpBits) +
    bits(BigInt(indicatorItemRef), p.refBits) +
    bits(s, 38);

  if (binary.length !== 96) throw new Error(`encode алдаа: ${binary.length} bit`);
  return BigInt("0b" + binary).toString(16).toUpperCase().padStart(24, "0");
}

/**
 * Нэг бараанд эхлэх serial-аас count ширхэг EPC үүсгэнэ.
 * startSerial-г DB-ийн allocate_serials()-аас авна.
 */
export function sgtin96Batch(
  base: Omit<Sgtin96Input, "serial">,
  startSerial: bigint | number,
  count: number
): { serial: bigint; epcHex: string }[] {
  const start = BigInt(startSerial);
  const out: { serial: bigint; epcHex: string }[] = [];
  for (let i = 0n; i < BigInt(count); i++) {
    const serial = start + i;
    out.push({ serial, epcHex: sgtin96Encode({ ...base, serial }) });
  }
  return out;
}

// ============================================================
// GTIN (EAN баркод) -> SGTIN-96
// Жижиглэн дэлгүүр олон брэндийн бараа хүлээн авдаг тул бараа бүрийн GTIN-ээс
// шууд EPC үүсгэнэ. Брэнд бүрийн жинхэнэ GCP (company prefix) уртыг мэдэхгүй ч,
// SGTIN-ийг ямар ч хүчинтэй хуваалтаар кодолсон GTIN нь decode хийхэд ИЖИЛ
// буцдаг (companyPrefix ⧺ itemReference = GTIN-ийн 12 орон). Тиймээс дотоод
// тооллогод тогтмол default хуваалт хангалттай.
// ============================================================

/** SGTIN хуваахад ашиглах default company-prefix урт (6–12). */
export const DEFAULT_GCP_LENGTH = 7;

/** GTIN check digit-ийг тооцоолно (GTIN-8/12/13/14, баруунаас 3,1,3,1…). */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  const d = digitsWithoutCheck.replace(/\D/g, "");
  let sum = 0;
  for (let i = 0; i < d.length; i++) {
    const n = Number(d[d.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}

/**
 * Дурын GTIN/EAN баркодыг 14 оронтой GTIN-14 болгож нормчилж, check digit-ийг
 * шалгана. (EAN-8/UPC-12/EAN-13/GTIN-14-г бүгдийг хүлээн авна.)
 */
export function normalizeGtin(raw: string): string {
  const d = String(raw).replace(/\D/g, "");
  if (d.length < 8 || d.length > 14) {
    throw new Error(`GTIN/баркод "${raw}" урт буруу (${d.length} орон; 8–14 байх ёстой)`);
  }
  const g14 = d.padStart(14, "0");
  if (gtinCheckDigit(g14.slice(0, 13)) !== Number(g14[13])) {
    throw new Error(`Баркод "${raw}"-ийн шалгах орон таарахгүй байна`);
  }
  return g14;
}

/**
 * GTIN/EAN баркод -> SGTIN-96 hex (24 тэмдэгт). Default GCP хуваалтаар.
 * indicator = GTIN-14-ийн эхний орон (хэрэглээний бараанд 0).
 */
export function sgtin96FromGtin(
  gtin: string,
  serial: bigint | number,
  filter = 1,
  gcpLength: number = DEFAULT_GCP_LENGTH
): string {
  const g14 = normalizeGtin(gtin);
  const indicator = Number(g14[0]);
  const data12 = g14.slice(1, 13);
  const companyPrefix = data12.slice(0, gcpLength);
  const itemReference = data12.slice(gcpLength);
  const indicatorItemRef = buildIndicatorItemRef(gcpLength, indicator, itemReference);
  return sgtin96Encode({ companyPrefix, indicatorItemRef, serial, filter });
}

/** GTIN-ээс эхлэх serial-аас count ширхэг EPC багц үүсгэнэ. */
export function sgtin96BatchFromGtin(
  gtin: string,
  startSerial: bigint | number,
  count: number,
  filter = 1,
  gcpLength: number = DEFAULT_GCP_LENGTH
): { serial: bigint; epcHex: string }[] {
  const g14 = normalizeGtin(gtin);
  const indicator = Number(g14[0]);
  const data12 = g14.slice(1, 13);
  const companyPrefix = data12.slice(0, gcpLength);
  const indicatorItemRef = buildIndicatorItemRef(gcpLength, indicator, data12.slice(gcpLength));
  return sgtin96Batch({ companyPrefix, indicatorItemRef, filter }, startSerial, count);
}

/**
 * RFID уншигчаас ирсэн EPC hex-г нормчилно: зай/цэг арилгаж, том үсэг болгоно.
 * 24 тэмдэгт hex биш бол алдаа шиднэ. Хайхын өмнө энэ функцээр дамжуул.
 */
export function normalizeEpc(raw: string): string {
  const cleaned = raw.replace(/[\s:.-]/g, "").toUpperCase();
  if (!/^[0-9A-F]{24}$/.test(cleaned)) {
    throw new Error("SGTIN-96 hex буруу (24 hex тэмдэгт байх ёстой)");
  }
  return cleaned;
}

// ============================================================
// SGTIN-96 decode + EPC URI (Pure Identity / Tag URI)
// GS1 EPC Tag Data Standard §6, §12.3.
//   hex 3074257BF7194E4000001A85
//     -> urn:epc:id:sgtin:0614141.812345.6789
//     -> urn:epc:tag:sgtin-96:3.0614141.812345.6789
// ============================================================

export interface Sgtin96Parts {
  filter: number;
  partition: number;
  companyPrefix: string;    // тэргүүлэх тэгтэйгээ (str)
  indicatorItemRef: string; // indicator + item reference, тэгээр гүйцээсэн
  serial: string;           // bigint-г string-ээр (нарийвчлал алдахгүй)
}

/** 24 тэмдэгт SGTIN-96 hex-г бүрэлдэхүүн талбаруудад нь задална. */
export function sgtin96Decode(epcHex: string): Sgtin96Parts {
  const hex = normalizeEpc(epcHex);
  const bin = BigInt("0x" + hex).toString(2).padStart(96, "0");

  const header = parseInt(bin.slice(0, 8), 2);
  if (header !== 0x30) {
    throw new Error(`SGTIN-96 биш (header 0x${header.toString(16)}, 0x30 байх ёстой)`);
  }

  const filter = parseInt(bin.slice(8, 11), 2);
  const partition = parseInt(bin.slice(11, 14), 2);
  const p = PARTITION_BY_VALUE[partition];
  if (!p) throw new Error(`partition ${partition} буруу (0-6 байх ёстой)`);

  const cpStart = 14;
  const refStart = cpStart + p.cpBits;
  const serStart = refStart + p.refBits;

  const companyPrefix = BigInt("0b" + bin.slice(cpStart, refStart)).toString().padStart(p.cpDigits, "0");
  const indicatorItemRef = BigInt("0b" + bin.slice(refStart, serStart)).toString().padStart(p.refDigits, "0");
  const serial = BigInt("0b" + bin.slice(serStart, 96)).toString();

  return { filter, partition, companyPrefix, indicatorItemRef, serial };
}

/**
 * SGTIN-96 hex -> Pure Identity URI.
 * Жишээ: urn:epc:id:sgtin:0614141.812345.6789 (filter байхгүй).
 */
export function sgtin96HexToUri(epcHex: string): string {
  const { companyPrefix, indicatorItemRef, serial } = sgtin96Decode(epcHex);
  return `urn:epc:id:sgtin:${companyPrefix}.${indicatorItemRef}.${serial}`;
}

/**
 * SGTIN-96 hex -> Tag URI (filter утгатай, тагт бичих түвшний дүрслэл).
 * Жишээ: urn:epc:tag:sgtin-96:3.0614141.812345.6789
 */
export function sgtin96HexToTagUri(epcHex: string): string {
  const { filter, companyPrefix, indicatorItemRef, serial } = sgtin96Decode(epcHex);
  return `urn:epc:tag:sgtin-96:${filter}.${companyPrefix}.${indicatorItemRef}.${serial}`;
}

// ============================================================
// GID-96 (General Identifier) — GS1-гүй дотоод EPC
//   Баркод/GTIN байхгүй барааг кодлоход. Бүх талбар нибблд тэгшилдэг
//   (8+28+24+36 бит) тул hex-ээр шууд залгаж болно. Header 0x35.
//     urn:epc:id:gid:ManagerNumber.ObjectClass.Serial
//   GS1 шаардлагагүй; зөвхөн дотоод (хаалттай) системд unique байхад л болно.
// ============================================================
const GID96_HEADER = 0x35n;
const GID_MANAGER_MAX = (1n << 28n) - 1n; // 268,435,455
const GID_CLASS_MAX = (1n << 24n) - 1n; //  16,777,215
const GID_SERIAL_MAX = (1n << 36n) - 1n; //  68,719,476,735

export interface Gid96Input {
  managerNumber: bigint | number; // тенант/компанийн дугаар (28-бит)
  objectClass: bigint | number; //   барааны дугаар (24-бит)
  serial: bigint | number; //        ширхгийн дугаар (36-бит)
}

/** GID-96 EPC-г 24 тэмдэгтийн hex болгож кодлоно. */
export function gid96Encode({ managerNumber, objectClass, serial }: Gid96Input): string {
  const m = BigInt(managerNumber);
  const c = BigInt(objectClass);
  const s = BigInt(serial);
  if (m < 0n || m > GID_MANAGER_MAX) throw new Error(`manager number 0..${GID_MANAGER_MAX} байх ёстой`);
  if (c < 0n || c > GID_CLASS_MAX) throw new Error(`object class 0..${GID_CLASS_MAX} байх ёстой`);
  if (s < 0n || s > GID_SERIAL_MAX) throw new Error(`serial 0..${GID_SERIAL_MAX} байх ёстой`);

  const binary = bits(GID96_HEADER, 8) + bits(m, 28) + bits(c, 24) + bits(s, 36);
  if (binary.length !== 96) throw new Error(`encode алдаа: ${binary.length} bit`);
  return BigInt("0b" + binary).toString(16).toUpperCase().padStart(24, "0");
}

/** Нэг бараанд эхлэх serial-аас count ширхэг GID-96 EPC үүсгэнэ. */
export function gid96Batch(
  base: Omit<Gid96Input, "serial">,
  startSerial: bigint | number,
  count: number
): { serial: bigint; epcHex: string }[] {
  const start = BigInt(startSerial);
  const out: { serial: bigint; epcHex: string }[] = [];
  for (let i = 0n; i < BigInt(count); i++) {
    const serial = start + i;
    out.push({ serial, epcHex: gid96Encode({ ...base, serial }) });
  }
  return out;
}

export interface Gid96Parts {
  managerNumber: string;
  objectClass: string;
  serial: string;
}

/** 24 тэмдэгт GID-96 hex-г бүрэлдэхүүн талбаруудад нь задална. */
export function gid96Decode(epcHex: string): Gid96Parts {
  const hex = normalizeEpc(epcHex);
  const bin = BigInt("0x" + hex).toString(2).padStart(96, "0");
  const header = parseInt(bin.slice(0, 8), 2);
  if (header !== 0x35) {
    throw new Error(`GID-96 биш (header 0x${header.toString(16)}, 0x35 байх ёстой)`);
  }
  return {
    managerNumber: BigInt("0b" + bin.slice(8, 36)).toString(),
    objectClass: BigInt("0b" + bin.slice(36, 60)).toString(),
    serial: BigInt("0b" + bin.slice(60, 96)).toString(),
  };
}

/** GID-96 hex -> Pure Identity URI (urn:epc:id:gid:Manager.Class.Serial). */
export function gid96HexToUri(epcHex: string): string {
  const { managerNumber, objectClass, serial } = gid96Decode(epcHex);
  return `urn:epc:id:gid:${managerNumber}.${objectClass}.${serial}`;
}

// ============================================================
// Төрөл-мэдрэгч (header-ээр SGTIN-96 / GID-96-г ялгана) URI хувиргагч.
//   Хүснэгт/хайлтад EPC аль ч схемийн байж болох тул эдгээрийг ашиглана.
// ============================================================

/** EPC hex -> Pure Identity URI (header-ээр төрлийг таньж). */
export function epcHexToUri(epcHex: string): string {
  const hex = normalizeEpc(epcHex);
  const header = parseInt(hex.slice(0, 2), 16);
  if (header === 0x30) return sgtin96HexToUri(hex);
  if (header === 0x35) return gid96HexToUri(hex);
  throw new Error(`EPC header 0x${header.toString(16)} дэмжигдээгүй`);
}

/** EPC hex -> Tag URI (header-ээр төрлийг таньж). */
export function epcHexToTagUri(epcHex: string): string {
  const hex = normalizeEpc(epcHex);
  const header = parseInt(hex.slice(0, 2), 16);
  if (header === 0x30) return sgtin96HexToTagUri(hex);
  if (header === 0x35) {
    const { managerNumber, objectClass, serial } = gid96Decode(hex);
    return `urn:epc:tag:gid-96:${managerNumber}.${objectClass}.${serial}`;
  }
  throw new Error(`EPC header 0x${header.toString(16)} дэмжигдээгүй`);
}
