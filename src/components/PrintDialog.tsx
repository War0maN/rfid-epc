import { useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
    () => templates.find((tp) => tp.id === templateId) ?? null,
    [templates, templateId]
  );

  // Загваруудыг ачаалах
  useEffect(() => {
    let active = true;
    listTemplates()
      .then((ts) => {
        if (!active) return;
        setTemplates(ts);
        if (ts.length) setTemplateId(ts[0].id);
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
        else setError(t("labels.print.noPrintersFound"));
      })
      .catch((e) => setError(errorMessage(e)));
  }

  async function handlePrint() {
    if (!template) return;
    const device = printers.find((p) => p.uid === printerUid);
    if (!device) {
      setError(t("labels.print.selectPrinter"));
      return;
    }
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const zpl = await buildBatchZpl(template, rows, offset);
      await sendToPrinter(device, zpl);
      setInfo(t("labels.print.sentToPrinter", { n: rows.length }));
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
          <h2 className="text-lg font-semibold text-slate-900">{t("labels.print.title")}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>

        <p className="mb-3 text-sm text-slate-600">
          <Trans
            i18nKey="labels.print.willPrint"
            values={{ n: rows.length }}
            components={{ b: <strong /> }}
          />
        </p>

        {/* Загвар */}
        <label className="mb-1 block text-xs font-medium text-slate-600">
          {t("labels.print.templateLabel")}
        </label>
        {templates.length === 0 ? (
          <p className="mb-3 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            {t("labels.print.noTemplates")}
          </p>
        ) : (
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="mb-3 w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
          >
            {templates.map((tp) => (
              <option key={tp.id} value={tp.id}>
                {tp.name} ({t("labels.print.templateSize", { w: tp.width_mm, h: tp.height_mm, dpi: tp.dpi })})
              </option>
            ))}
          </select>
        )}

        {/* Preview */}
        {preview && (
          <div className="mb-3">
            <div className="mb-1 text-xs font-medium text-slate-600">{t("labels.print.previewLabel")}</div>
            <div className="inline-block rounded border border-slate-300 bg-[repeating-conic-gradient(#f1f5f9_0%_25%,#fff_0%_50%)] bg-[length:12px_12px] p-2">
              <img src={preview} alt="preview" className="max-h-40" style={{ imageRendering: "pixelated" }} />
            </div>
          </div>
        )}

        {/* Байрлал тааруулах (хэвлэгдэх байрлал гажвал) */}
        <div className="mb-3">
          <label className="mb-1 block text-xs font-medium text-slate-600">
            {t("labels.print.offsetLabel")}
          </label>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{t("labels.print.offsetX")}</span>
              <input
                type="number"
                step={0.5}
                value={offsetX}
                onChange={(e) => setOffsetX(Number(e.target.value) || 0)}
                className="w-20 rounded border border-slate-300 px-2 py-1 text-sm"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs text-slate-500">{t("labels.print.offsetY")}</span>
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
                {t("labels.print.resetOffset")}
              </button>
            )}
          </div>
          <p className="mt-1 text-[11px] text-slate-400">{t("labels.print.offsetHint")}</p>
        </div>

        {/* Принтер */}
        <div className="mb-3">
          <div className="mb-1 flex items-center justify-between">
            <label className="text-xs font-medium text-slate-600">{t("labels.print.printerLabel")}</label>
            <button onClick={loadPrinters} className="text-xs text-indigo-600 hover:underline">
              {t("labels.print.findPrinters")}
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
                ? t("labels.print.pressFindPrinters")
                : t("labels.print.noBrowserPrint")}
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
            {t("labels.print.downloadZpl")}
          </button>
          <button
            onClick={handlePrint}
            disabled={busy || !template || printers.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            {busy ? t("labels.print.printing") : t("labels.print.print")}
          </button>
        </div>
      </div>
    </div>
  );
}
