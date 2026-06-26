import { errorMessage } from "../lib/errorMessage";
import { useRef, useState, type FormEvent } from "react";
import { supabase } from "../lib/supabaseClient";
import { importPackingListXlsx } from "../lib/importPackingList";

interface Props {
  /** Амжилттай үүсгэсний дараа эцэг компонентод мэдэгдэх (жагсаалт сэргээх). */
  onCreated?: (jobId: string) => void;
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
export default function CreateJobForm({ onCreated }: Props) {
  const [jobNumber, setJobNumber] = useState("");
  const [arrivalDate, setArrivalDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [supplier, setSupplier] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);

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
      setError("Packing list Excel файл сонгоно уу.");
      return;
    }

    setLoading(true);
    try {
      const res = await importPackingListXlsx(supabase, file, {
        jobNumber: jobNumber.trim(),
        arrivalDate,
        supplier: supplier.trim() || undefined,
        note: note.trim() || undefined,
      });
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
        <h2 className="mb-4 text-lg font-semibold text-slate-900">Шинэ ажил үүсгэх</h2>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ажлын дугаар <span className="text-red-500">*</span>
            </label>
            <input
              required
              value={jobNumber}
              onChange={(e) => setJobNumber(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="JOB-2026-001"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">
              Ирсэн огноо <span className="text-red-500">*</span>
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
            <label className="mb-1 block text-sm font-medium text-slate-700">Нийлүүлэгч</label>
            <input
              value={supplier}
              onChange={(e) => setSupplier(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="Нийлүүлэгчийн нэр"
            />
          </div>

          <div>
            <label className="mb-1 block text-sm font-medium text-slate-700">Тэмдэглэл</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200"
              placeholder="Заавал биш"
            />
          </div>
        </div>

        <div className="mt-4">
          <label className="mb-1 block text-sm font-medium text-slate-700">
            Packing list (Excel) <span className="text-red-500">*</span>
          </label>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-4 file:py-2 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
          />
          <p className="mt-2 text-xs text-slate-500">
            Багана: <code className="rounded bg-slate-100 px-1">name, sku, barcode, piece, box, category</code>{" "}
            болон <strong>дурын шинж чанарын багана</strong> (Өнгө, Размер…).{" "}
            <code className="rounded bg-slate-100 px-1">piece</code> заавал;{" "}
            <code className="rounded bg-slate-100 px-1">barcode</code> сонголт (байвал SGTIN-96, эс
            бөгөөс GID-96). <code className="rounded bg-slate-100 px-1">category</code> нь зам байж
            болно (ж: <code className="rounded bg-slate-100 px-1">Хувцас / Дээд</code>) — байхгүй
            ангилал автоматаар үүснэ. Нөөц баганаас бусад бүх багана шинж чанар болж бараанд
            хадгалагдана.
          </p>
        </div>

        {error && (
          <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        )}

        {result && (
          <div className="mt-4 space-y-2">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Амжилттай! <strong>{result.totalEpcs}</strong> EPC үүслээ ({result.productCount} бараа,{" "}
              {result.boxCount} хайрцаг
              {result.categoryCount > 0 ? `, ${result.categoryCount} ангилал` : ""}). "EPC хүснэгт"
              таб дээр харна уу.
            </p>
            {result.skippedCount > 0 && (
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700">
                ⚠️ {result.skippedCount} мөр алгаслаа (barcode дутуу/буруу).
                {result.skippedSample.length > 0 && (
                  <span className="block">Жишээ: {result.skippedSample.join("; ")}</span>
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
          {loading ? "Үүсгэж байна…" : "Ажил үүсгэж EPC генерацлэх"}
        </button>
      </form>
    </div>
  );
}
