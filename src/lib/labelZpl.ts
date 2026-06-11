// ============================================================
// Шошго → ZPL (bitmap WYSIWYG)
//   Template + дата → принтерийн DPI-д canvas зурж → 1-bit bitmap → ^GFA.
//   RFID объект → ^RFW,H (чипэд EPC шарах). Үр дүн нь нэг ^XA…^XZ.
// Зурснаараа яг хэвлэгдэнэ; кирилл/фонт/зураг/эргүүлэлт бүгд ажиллана.
// ============================================================
import { renderBarcodeCanvas } from "./barcode";
import { resolveField, type LabelTemplate, type LabelObject, type LabelData } from "./labelTemplate";

const PT_PER_INCH = 72;
const MM_PER_INCH = 25.4;

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    if (!src) return resolve(null);
    const im = new window.Image();
    im.onload = () => resolve(im);
    im.onerror = () => resolve(null);
    im.src = src;
  });
}

/** Объектын утга (дата орлуулсан). */
function valueOf(o: LabelObject, data: LabelData): string {
  if (o.type === "text" || o.type === "barcode") return resolveField(o.field, o.text, data);
  if (o.type === "rfid") return data.epc_hex ?? "";
  return "";
}

/**
 * Template + нэг мөрийн дата-г принтерийн DPI-д canvas болгож зурна.
 * (Preview болон ZPL bitmap-д ашиглана.)
 */
export async function renderLabelToCanvas(
  template: LabelTemplate,
  data: LabelData
): Promise<HTMLCanvasElement> {
  const dpi = template.dpi || 300;
  const pxPerMm = dpi / MM_PER_INCH;
  const W = Math.max(1, Math.round(template.width_mm * pxPerMm));
  const H = Math.max(1, Math.round(template.height_mm * pxPerMm));

  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000";

  const mm = (v: number) => v * pxPerMm;

  for (const o of template.objects) {
    ctx.save();
    ctx.translate(mm(o.x), mm(o.y));
    if (o.rotation) ctx.rotate((o.rotation * Math.PI) / 180);

    if (o.type === "text") {
      const fontPx = (o.fontSize / PT_PER_INCH) * dpi;
      ctx.font = `${o.bold ? "bold " : ""}${fontPx}px ${o.fontFamily}, Arial, sans-serif`;
      ctx.textBaseline = "top";
      ctx.fillStyle = "#000";
      const text = valueOf(o, data);
      const boxW = mm(o.width);
      const tw = ctx.measureText(text).width;
      let tx = 0;
      if (o.align === "center") tx = (boxW - tw) / 2;
      else if (o.align === "right") tx = boxW - tw;
      ctx.fillText(text, tx, 0);
    } else if (o.type === "rect") {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = Math.max(1, mm(o.borderWidth));
      ctx.strokeRect(0, 0, mm(o.width), mm(o.height));
    } else if (o.type === "barcode") {
      const scale = Math.max(2, Math.round(dpi / 90));
      const bc = renderBarcodeCanvas(o.symbology, valueOf(o, data), o.showText, scale);
      if (bc) ctx.drawImage(bc, 0, 0, mm(o.width), mm(o.height));
    } else if (o.type === "image") {
      const im = await loadImage(o.src);
      if (im) ctx.drawImage(im, 0, 0, mm(o.width), mm(o.height));
    }
    // rfid — visual-гүй (доор ^RFW үүснэ)
    ctx.restore();
  }
  return canvas;
}

/**
 * ZPL ^GFA ACS давталтын кодыг үүсгэнэ (нэг hex оронг count удаа давтахад).
 *   G..Y = 1..19, g..z = 20..400 (20-ийн үржвэр). 400-аас дээшийг 'z'-ээр давтана.
 */
function repeatCode(count: number): string {
  let s = "";
  while (count >= 400) {
    s += "z";
    count -= 400;
  }
  if (count >= 20) {
    s += String.fromCharCode(102 + Math.floor(count / 20)); // g..z (20..380)
    count %= 20;
  }
  if (count > 0) s += String.fromCharCode(70 + count); // G..Y (1..19)
  return s;
}

/**
 * Нэг мөрийн hex-г ZPL ACS аргаар шахна:
 *   давтагдсан оронг RLE кодоор, мөрийн төгсгөлийн 0-г ","-ээр,
 *   төгсгөлийн F-г "!"-ээр орлуулна.
 */
function compressRow(hexRow: string): string {
  let out = "";
  const n = hexRow.length;
  let i = 0;
  while (i < n) {
    const c = hexRow[i];
    let count = 1;
    while (i + count < n && hexRow[i + count] === c) count++;
    if (i + count === n) {
      // Мөрийн үлдсэн хэсэг бүхэлдээ ижил орон — товчилно.
      if (c === "0") return out + ",";
      if (c === "F") return out + "!";
    }
    out += count > 1 ? repeatCode(count) + c : c;
    i += count;
  }
  return out;
}

/** Хэвлэлтийн байрлал тааруулах шилжүүлэлт (мм). */
export interface PrintOffset {
  x_mm: number;
  y_mm: number;
}

/** Canvas-ийг 1-bit ^GFA ZPL хэсэг болгоно (хар пиксел = 1, ACS шахалттай). */
function canvasToGfa(canvas: HTMLCanvasElement, offX = 0, offY = 0): string {
  const { width: W, height: H } = canvas;
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  const data = ctx.getImageData(0, 0, W, H).data;
  const rowBytes = Math.ceil(W / 8);
  const total = rowBytes * H;

  let out = "";
  let prevRaw: string | null = null;
  for (let y = 0; y < H; y++) {
    let row = "";
    for (let b = 0; b < rowBytes; b++) {
      let byte = 0;
      for (let bit = 0; bit < 8; bit++) {
        const x = b * 8 + bit;
        if (x < W) {
          const i = (y * W + x) * 4;
          const lum = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
          const dark = data[i + 3] > 128 && lum < 128;
          if (dark) byte |= 0x80 >> bit;
        }
      }
      row += byte.toString(16).padStart(2, "0").toUpperCase();
    }
    // Мөр өмнөхтэйгөө ижил бол ":"-ээр давтана.
    if (row === prevRaw) out += ":";
    else out += compressRow(row);
    prevRaw = row;
  }
  return `^FO${offX},${offY}^GFA,${total},${total},${rowBytes},${out}^FS`;
}

/** Template + нэг мөрийн дата → нэг шошгоны ZPL (^XA…^XZ), чип шарах + зураг. */
export async function buildLabelZpl(
  template: LabelTemplate,
  data: LabelData,
  offset: PrintOffset = { x_mm: 0, y_mm: 0 }
): Promise<string> {
  const canvas = await renderLabelToCanvas(template, data);
  const pxPerMm = (template.dpi || 300) / MM_PER_INCH;
  const offX = Math.round(offset.x_mm * pxPerMm);
  const offY = Math.round(offset.y_mm * pxPerMm);
  const gfa = canvasToGfa(canvas, offX, offY);

  // Принтерт шошгоны яг хэмжээг хэлнэ (байрлал тогтворжино).
  const sizing = `^PW${canvas.width}\n^LL${canvas.height}\n`;

  // RFID объект байвал тухайн EPC-г чипэд шарна (нэг чип — эхнийхийг авна).
  const rfid = template.objects.find((o) => o.type === "rfid");
  const epc = rfid ? (data.epc_hex ?? "").replace(/[^0-9A-Fa-f]/g, "").toUpperCase() : "";
  const rfw = epc ? `^RFW,H^FD${epc}^FS\n` : "";

  return `^XA\n${sizing}${rfw}${gfa}\n^XZ`;
}

/** Олон мөрийн дата → багц ZPL (мөр бүрд нэг шошго). */
export async function buildBatchZpl(
  template: LabelTemplate,
  rows: LabelData[],
  offset: PrintOffset = { x_mm: 0, y_mm: 0 }
): Promise<string> {
  const parts: string[] = [];
  for (const r of rows) parts.push(await buildLabelZpl(template, r, offset));
  return parts.join("\n");
}
