import { errorMessage } from "../lib/errorMessage";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { supabase } from "../lib/supabaseClient";
import { importPackingListXlsx } from "../lib/importPackingList";
import { listBranches, type Branch } from "../lib/branches";

interface Props {
  /** Амжилттай үүсгэсний дараа эцэг компонентод мэдэгдэх (жагсаалт сэргээх). */
  onCreated?: (jobId: string) => void;
  /** Хуваарилагдсан салбарууд (null = хязгааргүй). Сонголтыг үүгээр шүүнэ. */
  allowedBranches?: string[] | null;
}

interface Result {
  jobId: string;
  totalEpcs: number;
  productCount: number;
  boxCount: number;
  categoryCount: number;
  skippedCount: number;
  skippedSample: string[];
}

/** Ажил (Job) үүсгэх форм + packing list CSV upload -> EPC генерац. */
export default function CreateJobForm({ onCreated, allowedBranches = null }: Props) {
  const { t } = useTranslation();
  const [jobNumber, setJobNumber] = useState("");
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  useEffect(() => {
    let active = true;
    listBranches()
      .then((all) => {
        if (!active) return;
        // Хуваарилагдсан салбарууд байвал зөвхөн тэдгээрийг санал болгоно.
        const b = allowedBranches ? all.filter((x) => allowedBranches.includes(x.id)) : all;
        setBranches(b);
        setBranchId(b[0]?.id ?? "");
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [allowedBranches]);

  function reset() {
    setJobNumber("");
    setSupplier("");
    setNote("");
    setFile(null);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);

    if (!file) {
      setError(t("createJob.selectFile"));
      return;
    }

    setLoading(true);
    try {
      const res = await importPackingListXlsx(
        supabase,
        file,
        {
          jobNumber: jobNumber.trim(),
          arrivalDate,
          supplier: supplier.trim() || undefined,
          note: note.trim() || undefined,
        },
        branchId || null
      );
      setResult(res);
      reset();
      onCreated?.(res.jobId);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-2xl">
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h2 className="mb-4 text-lg font-semibold text-slate-900">{t("createJob.title")}</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("createJob.jobNumber")} <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder={t("createJob.jobNumberPlaceholder")}
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              {t("createJob.arrivalDate")} <span className="text-red-500">*</span>
            </label>
            <input
              type="date"
              required
              value={arrivalDate}
              onChange={(e) => setArrivalDate(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("createJob.supplier")}</label>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder={t("createJob.supplierPlaceholder")}
            />
          </div>

          {branches.length > 0 && (
            <div>
              <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.branch")}</label>
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              >
                {branches.map((b) => (<option key={b.id} value={b.id}>{b.name}</option>))}
              </select>
            </div>
          )}

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">{t("common.note")}</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder={t("createJob.optionalPlaceholder")}
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            {t("createJob.fileLabel")} <span className="text-red-500">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <p className="mt-2 text-xs text-slate-500">
            {t("createJob.hintIntro")}{" "}
            <code className="rounded bg-slate-100 px-1">name, sku, price, barcode, piece, box, branch, category</code>{" "}
            {t("createJob.hintAnd")} <strong>{t("createJob.hintAttrCols")}</strong>{" "}
            {t("createJob.hintAttrExamples")}{" "}
            <code className="rounded bg-slate-100 px-1">branch</code> {t("createJob.hintBranch")}{" "}
            <code className="rounded bg-slate-100 px-1">piece</code> {t("createJob.hintPiece")}{" "}
            <code className="rounded bg-slate-100 px-1">barcode</code> {t("createJob.hintBarcode")}{" "}
            <code className="rounded bg-slate-100 px-1">category</code> {t("createJob.hintCategory1")}{" "}
            <code className="rounded bg-slate-100 px-1">{t("createJob.hintCategoryExample")}</code>
            {t("createJob.hintCategory2")}
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              {t("createJob.successTitle")} <strong>{result.totalEpcs}</strong>{" "}
              {t("createJob.successBody", {
                products: result.productCount,
                boxes: result.boxCount,
              })}
              {result.categoryCount > 0
                ? t("createJob.successCategories", { n: result.categoryCount })
                : ""}
              {t("createJob.successTail")}
            </p>
            {result.skippedCount > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                {t("createJob.skippedRows", { n: result.skippedCount })}
                {result.skippedSample.length > 0 && (
                  <span className="block">
                    {t("createJob.skippedExample", { sample: result.skippedSample.join("; ") })}
                  </span>
                )}
              </p>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={loading}
          className="mt-6 w-full rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-700 disabled:opacity-60 sm:w-auto sm:px-6"
        >
          {loading ? t("createJob.creating") : t("createJob.submit")}
        </button>
      </form>
    </div>
  );
}
