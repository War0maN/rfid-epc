import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Printer } from "lucide-react";
import { buildNoteHtml } from "../lib/transferNote";
import { errorMessage } from "../lib/errorMessage";

interface Props {
  txId: string;
  onClose: () => void;
}

/**
 * Шилжүүлгийн падааны урьдчилан харах модал. Баримт iframe дотор
 * бүтэн харагдана, текстийг нь дараад шууд засаж болно (contentEditable).
 * "Хэвлэх / PDF" нь iframe-ийн print()-ийг дууддаг — хэвлэх цонхноос
 * "PDF болгож хадгалах" сонговол PDF болно. Popup ашиглахгүй.
 */
export default function TransferNoteDialog({ txId, onClose }: Props) {
  const { t } = useTranslation();
  const [html, setHtml] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let active = true;
    buildNoteHtml(txId)
      .then(({ html }) => active && setHtml(html))
      .catch((e) => active && setError(errorMessage(e)));
    return () => {
      active = false;
    };
  }, [txId]);

  /** iframe ачаалагдмагц баримтын их биеийг засварлах горимд оруулна. */
  function enableEditing() {
    const doc = iframeRef.current?.contentDocument;
    if (doc?.body) doc.body.contentEditable = "true";
  }

  function print() {
    const win = iframeRef.current?.contentWindow;
    if (!win) return;
    win.focus();
    win.print();
  }

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div className="min-w-0">
            <h3 className="font-semibold text-slate-900">{t("transferNote.previewTitle")}</h3>
            <p className="text-xs text-slate-500">{t("transferNote.editHint")}</p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              onClick={print}
              disabled={!html}
              className="rounded-lg bg-indigo-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
            >
              <Printer size={14} className="inline align-text-bottom" /> {t("transferNote.printPdf")}
            </button>
            <button
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
            >
              {t("common.close")}
            </button>
          </div>
        </div>
        <div className="flex-1 bg-slate-100 p-3">
          {error ? (
            <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
          ) : !html ? (
            <p className="py-10 text-center text-sm text-slate-400">{t("common.loading")}</p>
          ) : (
            <iframe
              ref={iframeRef}
              srcDoc={html}
              onLoad={enableEditing}
              title={t("transferNote.previewTitle")}
              className="h-full w-full rounded-lg border border-slate-200 bg-white shadow-sm"
            />
          )}
        </div>
      </div>
    </div>
  );
}
