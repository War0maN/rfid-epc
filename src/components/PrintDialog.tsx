import { useEffect, useMemo, useState } from "react";
import { listTemplates, type LabelTemplate, type LabelData } from "../lib/labelTemplate";
import { renderLabelToCanvas, buildBatchZpl, type PrintOffset } from "../lib/labelZpl";
import {
  getPrinters,
  sendToPrinter,
  downloadZplFile,
  isBrowserPrintAvailable,
  type BrowserPrintDevice,
} from "../lib/browserPrint";
import { errorMessage } from "../lib/errorMessage";

interface Props {
  rows: LabelData[];
  onClose: () => void;
  /** Хэвлэх/ZPL татах амжилттай болоход (хэвлэгдсэн төлөв тэмдэглэхэд). */
  onPrinted?: () => void;
}

/** Сонгосон EPC-үүдийг загвараар preview хийж, Browser Print-ээр хэвлэх диалог. */
export default function PrintDialog({ rows, onClose, onPrinted }: Props) {
  const [templates, setTemplates] = useState<LabelTemplate[]>([]);
  const [templateId, setTemplateId] = useState<string>("");
  const [preview, setPreview] = useState<string>("");
  const [printers, setPrinters] = useState<BrowserPrintDevice[]>([]);
  const [printerUid, setPrinterUid] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [offsetX, setOffsetX] = useState(0); // мм — баруун (+) / зүүн (−)
  const [offsetY, setOffsetY] = useState(0); // мм — доош (+) / дээш (−)

  const offset: PrintOffset = { x_mm: offsetX, y_mm: offsetY };

  const template = useMemo(
    () => templates.find((t) => t.id === templateId) ?? null,
    [templates, templateId]
  );

  // Загваруудыг ачаалах
  useEffect(() => {
    let active = true;
    listTemplates()
      .then((t) => {
        if (!active) return;
        setTemplates(t);
        if (t.length) setTemplateId(t[0].id);
      })
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, []);

  // Эхний мөрийн preview зураг (загвар/дата солигдоход дахин). setState-г зөвхөн
  // promise callback дотор дуудна (lint-ийн set-state-in-effect-ээс зайлсхийнэ).
  useEffect(() => {
    if (!template || rows.length === 0) return;
    let active = true;
    renderLabelToCanvas(template, rows[0])
      .then((c) => active && setPreview(c.toDataURL()))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [template, rows]);

  function loadPrinters() {
    setError(null);
    getPrinters()
      .then((ds) => {
        setPrinters(ds);
        if (ds.length) setPrinterUid(ds[0].uid);
        else setError("Принтер олдсонгүй. Browser Print болон принтерийн холболтоо шалгана уу.");
      })
      .catch((e) => setError(errorMessage(e)));
  }

  async function handlePrint() {
    if (!template) return;
    const device = printers.find((p) => p.uid === printerUid);
    if (!device) {
      setError("Принтер сонгоно уу (Принтер хайх дарна уу).");
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const zpl = await buildBatchZpl(template, rows, offset);
      await sendToPrinter(device, zpl);
      setInfo(`${rows.length} шошго принтер рүү илгээлээ.`);
      onPrinted?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleDownload() {
    if (!template) return;
    setBusy(true);
    setError(null);
    try {
      const zpl = await buildBatchZpl(template, rows, offset);
      downloadZplFile(`labels-${new Date().toISOString().slice(0, 10)}.zpl`, zpl);
      onPrinted?.();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-xl bg-white p-5 shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Шошго хэвлэх</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-3 text-sm text-slate-600">
          Сонгосон <strong>{rows.length}</strong> EPC-д шошго хэвлэнэ.
        </p>

        {/* Загвар */}
        <label className="mb-1 block text-xs font-medium text-slate-600">Шошгоны загвар</label>
        {templates.length === 0 ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            Загвар алга. Эхлээд "Шошго" таб дээр загвар үүсгэнэ үү.
          </p>
        ) : (
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {templates.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name} ({t.width_mm}×{t.height_mm}мм · {t.dpi}dpi)
              </option>
            ))}
          </select>
        )}

        {/* Preview */}
        {preview && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-slate-600">Урьдчилан харах (эхний мөр)</div>
            <div className="inline-block rounded border border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] p-2">
              <img src={preview} alt="preview" className="max-h-40" style={{ imageRendering: "pixelated" }} />
            </div>
          </div>
        )}

        {/* Байрлал тааруулах (хэвлэгдэх байрлал гажвал) */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            Байрлал тааруулах (мм)
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Хэвтээ X</span>
              <input
                type="number"
                step={0.5}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">Босоо Y</span>
              <input
                type="number"
                step={0.5}
                value={offsetY}
                onChange={(e) => setOffsetY(Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            {(offsetX !== 0 || offsetY !== 0) && (
              <button
                onClick={() => {
                  setOffsetX(0);
                  setOffsetY(0);
                }}
                className="text-xs text-indigo-600 hover:underline"
              >
                Тэглэх
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">
            Доош/баруун тийш = эерэг (+), дээш/зүүн тийш = сөрөг (−).
          </p>
        </div>

        {/* Принтер */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">Принтер (Browser Print)</label>
            <button onClick={loadPrinters} className="text-xs text-indigo-600 hover:underline">
              Принтер хайх
            </button>
          </div>
          {printers.length > 0 ? (
            <select
              value={printerUid}
              onChange={(e) => setPrinterUid(e.target.value)}
              className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
            >
              {printers.map((p) => (
                <option key={p.uid} value={p.uid}>
                  {p.name} ({p.connection})
                </option>
              ))}
            </select>
          ) : (
            <p className="text-xs text-slate-500">
              {isBrowserPrintAvailable()
                ? "«Принтер хайх» дарна уу."
                : "Browser Print суулгаагүй байж магадгүй — ZPL татаж хэвлэж болно."}
            </p>
          )}
        </div>

        {error && <p className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
        {info && <p className="mb-3 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{info}</p>}

        <div className="flex flex-wrap justify-end gap-2">
          <button
            onClick={handleDownload}
            disabled={busy || !template}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            ZPL татах
          </button>
          <button
            onClick={handlePrint}
            disabled={busy || !template || printers.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? "Хэвлэж байна…" : "Хэвлэх"}
          </button>
        </div>
      </div>
    </div>
  );
}
