// bwip-js-ийн exports map нь зөвхөн platform-condition (browser/node…)-той тул
// TS bundler resolution типийг олдоггүй. Бид зөвхөн toCanvas ашигладаг учир
// энд хэрэгцээт хэсгийг ambient-аар зарлая (runtime-г Vite browser-condition-оор
// зөв шийднэ).
declare module "bwip-js" {
  interface ToCanvasOptions {
    bcid: string;
    text: string;
    scale?: number;
    height?: number;
    width?: number;
    includetext?: boolean;
    textxalign?: string;
    paddingwidth?: number;
    paddingheight?: number;
    [key: string]: unknown;
  }
  const bwipjs: {
    toCanvas(canvas: HTMLCanvasElement | string, opts: ToCanvasOptions): HTMLCanvasElement;
  };
  export default bwipjs;
}
