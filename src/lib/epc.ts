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

/**
 * RFID уншигчаас ирсэн EPC hex-г нормчилно: зай/цэг арилгаж, том үсэг болгоно.
 * 24 тэмдэгт hex биш бол алдаа шиднэ. Хайхын өмнө энэ функцээр дамжуул.
 */
export function normalizeEpc(raw: string): string {
  const cleaned = raw.replace(/[\s:.\-]/g, "").toUpperCase();
  if (!/^[0-9A-F]{24}$/.test(cleaned)) {
    throw new Error("SGTIN-96 hex буруу (24 hex тэмдэгт байх ёстой)");
  }
  return cleaned;
}

/** GTIN-ийн check digit-г тооцоолно (GTIN-8/12/13/14). */
export function gtinCheckDigit(digitsWithoutCheck: string): number {
  const d = digitsWithoutCheck.replace(/\D/g, "");
  let sum = 0;
  // Баруунаас эхлэн ээлжлэн 3,1,3,1...
  for (let i = 0; i < d.length; i++) {
    const n = Number(d[d.length - 1 - i]);
    sum += i % 2 === 0 ? n * 3 : n;
  }
  return (10 - (sum % 10)) % 10;
}
