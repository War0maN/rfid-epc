// ============================================================
// bwip-js-ээр баркод/QR-г canvas болгож зурах туслах.
// Дизайнер дээр Konva.Image, хэвлэхэд bitmap-д ашиглана.
// ============================================================
import bwipjs from "bwip-js";
import type { Symbology } from "./labelTemplate";

const BCID: Record<Symbology, string> = {
  code128: "code128",
  ean13: "ean13",
  qrcode: "qrcode",
  datamatrix: "datamatrix",
};

/**
 * Баркодыг шинэ canvas дээр зурж буцаана. Алдаа гарвал (ж: EAN-д буруу орон)
 * null буцаана — дуудагч placeholder харуулна.
 *
 * @param scale  пиксел нягт (өндөр чанартай = том). Дизайнерт 4, хэвлэхэд DPI-аар.
 */
export function renderBarcodeCanvas(
  symbology: Symbology,
  text: string,
  showText: boolean,
  scale = 4
): HTMLCanvasElement | null {
  const t = (text ?? "").trim();
  if (!t) return null;
  const is2d = symbology === "qrcode" || symbology === "datamatrix";
  const canvas = document.createElement("canvas");
  try {
    bwipjs.toCanvas(canvas, {
      bcid: BCID[symbology],
      text: t,
      scale,
      ...(is2d ? {} : { height: 10 }),
      includetext: showText && !is2d,
      textxalign: "center",
      paddingwidth: 0,
      paddingheight: 0,
    });
    return canvas;
  } catch {
    return null;
  }
}
