import { useTranslation } from "react-i18next";

/**
 * Аппын өөрийн баталгаажуулах модал — window.confirm-ийн оронд.
 * (Browser-ийн систем диалогийг Chrome зарим үед чимээгүй хаадаг тул
 * найдваргүй; энэ модал үргэлж ажиллана, загвар нь ч нэгдмэл.)
 */
export default function ConfirmDialog({
  message,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: {
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center bg-black/30 p-4"
      onClick={onCancel}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <p className="whitespace-pre-line text-sm text-slate-700">{message}</p>
        <div className="mt-4 flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("common.cancel")}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className={
              "rounded-lg px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50 " +
              (danger ? "bg-red-600 hover:bg-red-700" : "bg-indigo-600 hover:bg-indigo-700")
            }
          >
            {confirmLabel ?? t("common.confirm")}
          </button>
        </div>
      </div>
    </div>
  );
}
