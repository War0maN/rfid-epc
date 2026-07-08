// ============================================================
// Zebra Browser Print холбогч.
//   Browser Print-ийн JS SDK (index.html-д <script>-оор ачаалсан) нь
//   window.BrowserPrint глобалыг гаргадаг. Энд promise-болгон боож өгнө.
//   SDK байхгүй бол ойлгомжтой алдаа шиднэ (ZPL татах fallback ашиглана).
// ============================================================
import i18n from "../i18n";

export interface BrowserPrintDevice {
  uid: string;
  name: string;
  connection: string;
  deviceType: string;
  send(data: string, success?: () => void, error?: (e: string) => void): void;
}

interface BrowserPrintSDK {
  getDefaultDevice(
    type: string,
    success: (d: BrowserPrintDevice) => void,
    error: (e: string) => void
  ): void;
  getLocalDevices(
    success: (devices: BrowserPrintDevice[]) => void,
    error: (e: string) => void,
    type?: string
  ): void;
}

declare global {
  interface Window {
    BrowserPrint?: BrowserPrintSDK;
  }
}

export function isBrowserPrintAvailable(): boolean {
  return typeof window !== "undefined" && !!window.BrowserPrint;
}

/** Холбогдсон Zebra принтерүүдийг жагсаана. */
export function getPrinters(): Promise<BrowserPrintDevice[]> {
  return new Promise((resolve, reject) => {
    const bp = window.BrowserPrint;
    if (!bp) return reject(new Error(i18n.t("labels.print.noSdk")));
    bp.getLocalDevices(
      (devices) => resolve(devices ?? []),
      (e) => reject(new Error(typeof e === "string" ? e : i18n.t("labels.print.bpError"))),
      "printer"
    );
  });
}

/** Өгөгдмөл принтер (байвал). */
export function getDefaultPrinter(): Promise<BrowserPrintDevice | null> {
  return new Promise((resolve, reject) => {
    const bp = window.BrowserPrint;
    if (!bp) return reject(new Error(i18n.t("labels.print.noSdk")));
    bp.getDefaultDevice(
      "printer",
      (d) => resolve(d ?? null),
      (e) => reject(new Error(typeof e === "string" ? e : i18n.t("labels.print.bpError")))
    );
  });
}

/** ZPL-г принтер рүү илгээх. */
export function sendToPrinter(device: BrowserPrintDevice, zpl: string): Promise<void> {
  return new Promise((resolve, reject) => {
    device.send(
      zpl,
      () => resolve(),
      (e) => reject(new Error(typeof e === "string" ? e : i18n.t("labels.print.sendError")))
    );
  });
}

/** ZPL-г .zpl файл болгож татах (Browser Print-гүй үед fallback). */
export function downloadZplFile(filename: string, zpl: string): void {
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
