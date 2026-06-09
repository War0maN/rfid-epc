// ============================================================
// ZPL (Zebra Programming Language) export — EPC багцаас RFID
// принтерийн .zpl файл үүсгэнэ. Шошго бүр:
//   - ^RFW,H : EPC hex-г RFID чипэд бичнэ (Gen2)
//   - цаасан дээр барааны нэр / item reference / serial текст
// Татаж аваад Zebra Setup Utilities (эсвэл принтерийн дараалал)
// руу илгээж хэвлэнэ.
//
// Анхаар: ^ ба ~ нь ZPL-ийн команд угтвар тул талбарын датанд
// орвол зайгаар солино. Кириллээр текст хэвлэхэд принтерт
// Unicode font тохируулсан байх шаардлагатай (^CW); тийм биш бол
// барааны нэр гажиж магадгүй тул item reference / serial-г
// (ASCII) үндсэн таних мэдээлэл болгон үргэлж хэвлэнэ.
// ============================================================

export interface ZplLabelInput {
  epcHex: string;
  name?: string | null;
  gtin?: string | null;
  sku?: string | null;
  boxNo?: string | null;
  serial?: number | string | null;
}

export interface ZplOptions {
  /** Шошго бүрийн хувь (^PQ). Default 1. */
  copies?: number;
  /** Хэвлэх нягтрал (^PR-гүй) — энд биш, тохиргоог принтерт үлдээе. */
  includeName?: boolean; // барааны нэр (кирилл) текст оруулах эсэх. Default true.
}

/** ZPL талбарт орох текстийг аюулгүй болгоно (команд угтвар, мөр шилжилт). */
function sanitize(value: unknown): string {
  return String(value ?? "")
    .replace(/[\^~]/g, " ")
    .replace(/[\r\n]+/g, " ")
    .trim();
}

/** Нэг EPC -> нэг ZPL шошго (^XA…^XZ). */
export function buildZplLabel(input: ZplLabelInput, opts: ZplOptions = {}): string {
  const { copies = 1, includeName = true } = opts;
  const hex = sanitize(input.epcHex).toUpperCase();
  const gtin = sanitize(input.gtin);
  const sku = sanitize(input.sku);
  const box = sanitize(input.boxNo);
  const serial = sanitize(input.serial);
  const name = sanitize(input.name);

  const lines: string[] = ["^XA", "^RS8", `^RFW,H^FD${hex}^FS`];

  let y = 30;
  if (includeName && name) {
    lines.push(`^FO40,${y}^A0N,28,28^FD${name}^FS`);
    y += 36;
  }
  // GTIN / SKU (ASCII, үргэлж аюулгүй)
  const idLine = [gtin && `GTIN: ${gtin}`, sku && `SKU: ${sku}`].filter(Boolean).join("  ");
  if (idLine) {
    lines.push(`^FO40,${y}^A0N,22,22^FD${idLine}^FS`);
    y += 30;
  }
  // Хайрцаг + serial (мөшгих)
  const boxLine = [box && `Box: ${box}`, serial && `SN: ${serial}`].filter(Boolean).join("  ");
  if (boxLine) {
    lines.push(`^FO40,${y}^A0N,22,22^FD${boxLine}^FS`);
    y += 30;
  }
  // EPC hex (хүн уншихуйц)
  lines.push(`^FO40,${y}^A0N,18,18^FD${hex}^FS`);

  if (copies > 1) lines.push(`^PQ${copies}`);
  lines.push("^XZ");
  return lines.join("\n");
}

/** EPC мөрүүдээс бүхэл ZPL баримт (олон шошго) угсарна. */
export function buildZplBatch(rows: ZplLabelInput[], opts: ZplOptions = {}): string {
  return rows.map((r) => buildZplLabel(r, opts)).join("\n");
}

/** ZPL текстийг .zpl файл болгож browser-ээр татуулна. */
export function downloadZpl(filename: string, zpl: string): void {
  const blob = new Blob([zpl], { type: "text/plain;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
