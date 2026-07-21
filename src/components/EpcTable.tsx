import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Trans, useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  fetchEpcPage,
  fetchEpcAllMatching,
  type EpcRow,
  type EpcSort,
} from "../lib/queries";
import { listAttributeDefs, dedupAttrs, type AttributeDef } from "../lib/catalog";
import { downloadCsv, toCsv } from "../lib/exportCsv";
import { epcHexToUri, epcHexToTagUri } from "../lib/epc";
import { supabase } from "../lib/supabaseClient";
import { logAuditEvent, epcBulkMeta } from "../lib/audit";
import { errorMessage } from "../lib/errorMessage";
import {
  EPC_STATUSES,
  STATUS_LABEL,
  badgeOf,
  labelOf,
  type EpcStatus,
} from "../lib/epcStatus";
import { makeCan } from "../lib/permissions";
import { formatMoney } from "../lib/format";
// bwip-js (баркод) том тул хэвлэх диалогийг зөвхөн нээх үед ачаална.
const PrintDialog = lazy(() => import("./PrintDialog"));

/** Сэргээх дохио: энэ тоо өөрчлөгдөхөд дахин татна. */
interface Props {
  refreshKey?: number;
  isAdmin?: boolean; // гараар төлөв солих зөвхөн админд
  /** EPC дээр дарахад — Хайлт таб руу үсэрч түүхийг харуулна. */
  onLookup?: (epcHex: string) => void;
  /** Олгосон эрхүүд (null = бүрэн). Хэвлэх товч нуухад — DB давхар хамгаална. */
  perms?: string[] | null;
}

/** Хүснэгтийн багана бүрийн тодорхойлолт (толгой + утга авах). */
interface ColDef {
  key: string;
  label: string;
  get: (r: EpcRow) => string; // түүхий утга (шүүлт server талд, CSV тусдаа)
  mono?: boolean;
  money?: boolean; // харуулахдаа мянгатын таслалтай
}

// Тогтмол багана (толгойн шошго нь идэвхтэй хэлээр — t-ээр render үед тооцно).
// Шинж чанарын багана нь attribute_defs-ээс динамикаар нэмэгдэнэ.
const staticColumns = (t: TFunction): ColDef[] => [
  { key: "epc", label: t("epcTable.colEpcHex"), get: (r) => r.epc_hex, mono: true },
  { key: "serial", label: t("epcTable.colSerial"), get: (r) => String(r.serial) },
  { key: "status", label: t("common.status"), get: (r) => labelOf(r.status) },
  { key: "name", label: t("common.product"), get: (r) => r.name ?? "" },
  { key: "cat1", label: t("epcTable.colCat1"), get: (r) => r.category_l1 ?? "" },
  { key: "cat2", label: t("epcTable.colCat2"), get: (r) => r.category_l2 ?? "" },
  { key: "cat3", label: t("epcTable.colCat3"), get: (r) => r.category_l3 ?? "" },
  { key: "branch", label: t("common.branch"), get: (r) => r.branch_name ?? "" },
  { key: "sku", label: t("common.sku"), get: (r) => r.sku ?? "", mono: true },
  { key: "price", label: t("common.price"), get: (r) => (r.price != null ? String(r.price) : ""), money: true },
  { key: "gtin", label: t("epcTable.colGtin"), get: (r) => r.gtin ?? "", mono: true },
  { key: "box", label: t("epcTable.colBox"), get: (r) => r.box_no ?? "" },
  { key: "job", label: t("epcTable.colJob"), get: (r) => r.job_number ?? "" },
  { key: "date", label: t("epcTable.colDate"), get: (r) => r.arrival_date ?? "" },
  { key: "supplier", label: t("epcTable.colSupplier"), get: (r) => r.supplier ?? "" },
];

// Нэг хуудсанд татах/харуулах мөрийн тоо (server-side хуудаслалт).
const PAGE_SIZE = 100;

// Нуусан баганыг localStorage-д хадгална (хэрэглэгч бүрд тогтоно).
const HIDDEN_KEY = "epcHiddenCols";
function loadHidden(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(HIDDEN_KEY) || "[]") as string[]);
  } catch {
    return new Set();
  }
}

/** hex -> URI; декод бүтэлгүйтвэл хоосон (export эвдрэхгүй). SGTIN/GID хоёуланг. */
function safeUri(hex: string): string {
  try {
    return epcHexToUri(hex);
  } catch {
    return "";
  }
}
function safeTagUri(hex: string): string {
  try {
    return epcHexToTagUri(hex);
  } catch {
    return "";
  }
}

export default function EpcTable({ refreshKey = 0, isAdmin = false, onLookup, perms = null }: Props) {
  const { t } = useTranslation();
  const can = makeCan(perms);
  const [pageRows, setPageRows] = useState<EpcRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false); // export/print бэлдэж байх үед
  const [error, setError] = useState<string | null>(null);
  // Багана бүрийн шүүлтийн текст (col.key -> хайх утга). debounced нь DB рүү.
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [debounced, setDebounced] = useState<Record<string, string>>({});
  const [page, setPage] = useState(0); // 0-ээс эхэлсэн хуудасны дугаар
  const [sort, setSort] = useState<EpcSort | null>(null);
  // Сонгосон мөрүүд (хуудас хооронд хадгалагдана; мөрийн дата-г бүхлээр нь хадгална).
  const [selected, setSelected] = useState<Map<string, EpcRow>>(new Map());
  const [printRows, setPrintRows] = useState<EpcRow[] | null>(null);
  // Төлөв өөрчлөх баталгаажуулалт: сонгосон зорилтот төлөв + тэмдэглэл.
  const [statusModal, setStatusModal] = useState<EpcStatus | null>(null);
  const [statusNote, setStatusNote] = useState("");
  // Устгах баталгаажуулалт (зөвхөн Хэвлээгүй устгагдана — DB trigger давхар хамгаална).
  const [deleteModal, setDeleteModal] = useState(false);
  // Динамик шинж чанарын багана + нуух/гаргах удирдлага.
  const [attrDefs, setAttrDefs] = useState<AttributeDef[]>([]);
  const [hidden, setHidden] = useState<Set<string>>(loadHidden);
  const [showColPicker, setShowColPicker] = useState(false);

  const hasFilters = Object.values(debounced).some((v) => v.trim());

  // Шинж чанаруудыг татаж динамик багана болгоно (импорт/үүсгэхэд шинэчилнэ).
  useEffect(() => {
    let active = true;
    listAttributeDefs()
      .then((d) => active && setAttrDefs(d))
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [refreshKey]);

  // Бүх багана = тогтмол + шинж чанар бүр (attr:<нэр>).
  const columns = useMemo<ColDef[]>(() => {
    const attrCols: ColDef[] = dedupAttrs(attrDefs).map((d) => ({
      key: `attr:${d.label}`,
      label: d.label,
      get: (r: EpcRow) => r.attributes?.[d.label] ?? "",
    }));
    return [...staticColumns(t), ...attrCols];
  }, [attrDefs, t]);

  const visibleColumns = useMemo(
    () => columns.filter((c) => !hidden.has(c.key)),
    [columns, hidden]
  );

  function toggleColumn(key: string) {
    setHidden((h) => {
      const n = new Set(h);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      try {
        localStorage.setItem(HIDDEN_KEY, JSON.stringify([...n]));
      } catch {
        /* localStorage байхгүй бол үл хамаарна */
      }
      return n;
    });
  }

  // Шүүлтийн оролтыг debounce хийнэ (бичих бүрд DB-рүү явахгүй).
  useEffect(() => {
    const t = setTimeout(() => setDebounced(filters), 300);
    return () => clearTimeout(t);
  }, [filters]);

  // Хуудсыг server-ээс татах (хуудас / шүүлт / эрэмбэ / сэргээх өөрчлөгдөхөд).
  // setState-г зөвхөн async callback дотор дуудна (lint: set-state-in-effect).
  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const res = await fetchEpcPage({ page, pageSize: PAGE_SIZE, filters: debounced, sort });
        if (!active) return;
        setPageRows(res.rows);
        setTotal(res.total);
        setError(null);
      } catch (e) {
        if (active) setError(errorMessage(e));
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [page, debounced, sort, refreshKey]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const visible = pageRows;

  // Шинэ хуудас руу шилжих (spinner-ийг тэр даруй харуулна).
  function goPage(p: number) {
    setLoading(true);
    setPage(p);
  }

  function setFilter(key: string, value: string) {
    setLoading(true);
    setFilters((f) => ({ ...f, [key]: value }));
    setPage(0); // шүүх үед эхний хуудас руу
  }

  function clearFilters() {
    setLoading(true);
    setFilters({});
    setPage(0);
  }

  // Толгой дарах: өсөх → буурах → эрэмбэлэхгүй.
  function toggleSort(key: string) {
    setLoading(true);
    setSort((s) =>
      s && s.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" }
    );
    setPage(0);
  }

  function toggleRow(r: EpcRow) {
    setSelected((m) => {
      const n = new Map(m);
      if (n.has(r.id)) n.delete(r.id);
      else n.set(r.id, r);
      return n;
    });
  }
  const allVisibleSelected = visible.length > 0 && visible.every((r) => selected.has(r.id));
  function toggleAllVisible() {
    setSelected((m) => {
      const n = new Map(m);
      if (allVisibleSelected) visible.forEach((r) => n.delete(r.id));
      else visible.forEach((r) => n.set(r.id, r));
      return n;
    });
  }

  /** Export/print-д ашиглах мөрүүд: сонгосон байвал тэдгээр, эс бөгөөс шүүсэн БҮХ мөр. */
  async function resolveRows(): Promise<EpcRow[]> {
    if (selected.size > 0) return [...selected.values()];
    return fetchEpcAllMatching(debounced, sort);
  }

  /** Өгсөн EPC-үүдийг хэвлэгдсэн (printed_at) + Идэвхтэй (status) болгоно. */
  async function markPrinted(rows: EpcRow[]) {
    if (rows.length === 0) return;
    const ids = rows.map((r) => r.id);
    const now = new Date().toISOString();
    const idSet = new Set(ids);
    // Optimistic: зөвхөн одоо Хэвлээгүй мөрд (хэвлэх нь sold/transferring-ийг буцаахгүй).
    const activate = (r: EpcRow): EpcRow =>
      idSet.has(r.id) && r.status === "unprinted"
        ? { ...r, printed_at: now, status: "active" }
        : r;
    setPageRows((rs) => rs.map(activate));
    setSelected((m) => {
      const n = new Map(m);
      for (const id of ids) {
        const r = n.get(id);
        if (r) n.set(id, activate(r));
      }
      return n;
    });
    try {
      for (let i = 0; i < ids.length; i += 500) {
        const { error: e } = await supabase
          .from("epc_codes")
          .update({ printed_at: now, status: "active" })
          .in("id", ids.slice(i, i + 500))
          .is("printed_at", null);
        if (e) throw e;
      }
      void logAuditEvent(supabase, "print", "epc", null, epcBulkMeta(rows));
    } catch (e) {
      setError(errorMessage(e));
    }
  }

  /**
   * EPC-үүдийн төлөвийг өөрчилнө (зөвхөн админ). Хэвлэх/CSV-тэй ижил:
   * сонгосон байвал тэдгээр, эс бөгөөс шүүлтэд тохирох БҮХ мөр (олон хуудас).
   * note = Тэмдэглэл — EPC бүрийн түүхэнд бичигдэнэ (гүйлгээний Тэмдэглэлтэй ижил ойлголт).
   */
  async function changeStatus(target: EpcStatus, note: string) {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      const ids = rows.map((r) => r.id);
      if (ids.length === 0) {
        setError(t("epcTable.noRowsToChange"));
        return;
      }
      // Optimistic: харагдаж буй хуудас + сонголтод тусгана.
      const idSet = new Set(ids);
      const apply = (r: EpcRow): EpcRow => (idSet.has(r.id) ? { ...r, status: target } : r);
      setPageRows((rs) => rs.map(apply));
      setSelected((m) => {
        const n = new Map(m);
        for (const id of ids) {
          const r = n.get(id);
          if (r) n.set(id, apply(r));
        }
        return n;
      });
      // RPC: тэмдэглэлийг transaction-local тавьж түүхэнд холбоно (change_epc_status).
      for (let i = 0; i < ids.length; i += 500) {
        const { error: e } = await supabase.rpc("change_epc_status", {
          p_ids: ids.slice(i, i + 500),
          p_status: target,
          p_reason: note.trim() || null,
        });
        if (e) throw e;
      }
      void logAuditEvent(supabase, "status_change", "epc", null, {
        ...epcBulkMeta(rows),
        status: target,
        note: note.trim() || undefined,
      });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function handleExport() {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      const attrLabels = dedupAttrs(attrDefs).map((d) => d.label);
      const flat = rows.map((r) => {
        const base: Record<string, unknown> = {
          epc_hex: r.epc_hex,
          epc_uri: safeUri(r.epc_hex),
          epc_tag_uri: safeTagUri(r.epc_hex),
          serial: r.serial,
          product: r.name ?? "",
          cat1: r.category_l1 ?? "",
          cat2: r.category_l2 ?? "",
          cat3: r.category_l3 ?? "",
          sku: r.sku ?? "",
          price: r.price ?? "",
          gtin: r.gtin ?? "",
          box_no: r.box_no ?? "",
          job_number: r.job_number ?? "",
          arrival_date: r.arrival_date ?? "",
          supplier: r.supplier ?? "",
          status: labelOf(r.status),
          created_at: r.created_at,
        };
        for (const l of attrLabels) base[`a_${l}`] = r.attributes?.[l] ?? "";
        return base;
      });
      // CSV-ийн толгойнууд export хийх мөчид идэвхтэй хэлээр тооцогдоно.
      const csv = toCsv(flat, [
        { key: "epc_hex", label: t("epcTable.colEpcHex") },
        { key: "epc_uri", label: t("epcTable.csvEpcUri") },
        { key: "epc_tag_uri", label: t("epcTable.csvEpcTagUri") },
        { key: "serial", label: t("epcTable.colSerial") },
        { key: "product", label: t("common.product") },
        { key: "cat1", label: t("epcTable.colCat1") },
        { key: "cat2", label: t("epcTable.colCat2") },
        { key: "cat3", label: t("epcTable.colCat3") },
        ...attrLabels.map((l) => ({ key: `a_${l}`, label: l })),
        { key: "sku", label: t("common.sku") },
        { key: "price", label: t("common.price") },
        { key: "gtin", label: t("epcTable.colGtin") },
        { key: "box_no", label: t("epcTable.colBox") },
        { key: "job_number", label: t("epcTable.colJob") },
        { key: "arrival_date", label: t("epcTable.colDate") },
        { key: "supplier", label: t("epcTable.colSupplier") },
        { key: "status", label: t("common.status") },
        { key: "created_at", label: t("epcTable.colCreated") },
      ]);
      downloadCsv(`epc-export-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      void logAuditEvent(supabase, "export_csv", "epc", null, { count: rows.length });
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function openPrint() {
    setBusy(true);
    setError(null);
    try {
      const rows = await resolveRows();
      if (rows.length === 0) {
        setError(t("epcTable.noRowsToPrint"));
        return;
      }
      setPrintRows(rows);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  /**
   * ЗӨВХӨН Хэвлээгүй EPC-үүдийг устгана (DB trigger давхар хориглоно —
   * Идэвхтэй болсон EPC "хөдөлгөөнтэй" тул эргүүлж Хэвлээгүй болгосны дараа л
   * устгагдана). ГҮЙЛГЭЭНИЙ ТҮҮХТЭЙ нь transaction_items FK-ээр хамгаалагдана —
   * урьдчилан шалгаж алгасна (түүх тасрахгүй). Бусад бөөн үйлдлүүдтэй ижил:
   * сонголт байвал сонголтод, үгүй бол шүүлтэд тохирох бүх мөрөнд үйлчилнэ.
   */
  async function handleDelete() {
    setBusy(true);
    setError(null);
    try {
      const base = selected.size > 0 ? [...selected.values()] : await resolveRows();
      const deletable = base.filter((r) => r.status === "unprinted");
      if (deletable.length === 0) {
        setError(t("epcTable.nothingDeletable"));
        return;
      }
      const skippedStatus = base.length - deletable.length;
      const candidateIds = deletable.map((r) => r.id);
      // Гүйлгээний түүхтэй EPC-үүдийг олж алгасна (устгавал түүх тасарна).
      const withHistory = new Set<string>();
      for (let i = 0; i < candidateIds.length; i += 300) {
        const { data, error: hErr } = await supabase
          .from("transaction_items")
          .select("epc_id")
          .in("epc_id", candidateIds.slice(i, i + 300));
        if (hErr) throw hErr;
        for (const r of (data ?? []) as { epc_id: string }[]) withHistory.add(r.epc_id);
      }
      const ids = candidateIds.filter((id) => !withHistory.has(id));

      for (let i = 0; i < ids.length; i += 500) {
        const { error: e } = await supabase
          .from("epc_codes")
          .delete()
          .in("id", ids.slice(i, i + 500));
        if (e) throw e;
      }
      // Optimistic: хуудас + сонголт + нийт тооноос хасна.
      const idSet = new Set(ids);
      setPageRows((rs) => rs.filter((r) => !idSet.has(r.id)));
      setSelected((m) => {
        const n = new Map(m);
        for (const id of ids) n.delete(id);
        return n;
      });
      setTotal((t) => Math.max(0, t - ids.length));
      if (ids.length > 0) {
        const deletedRows = deletable.filter((r) => idSet.has(r.id));
        void logAuditEvent(supabase, "delete", "epc", null, epcBulkMeta(deletedRows));
      }
      if (withHistory.size > 0 || skippedStatus > 0) {
        setError(
          t("epcTable.deleteResult", {
            deleted: ids.length,
            hist: withHistory.size,
            status: skippedStatus,
          })
        );
      }
    } catch (e) {
      // 23503 = FK — гүйлгээний түүх/төлөвийн хамгаалалт (fallback найрсаг мессеж).
      const err = e as { code?: string };
      if (err.code === "23503") {
        setError(t("epcTable.deleteFkProtected"));
      } else {
        setError(errorMessage(e));
      }
    } finally {
      setBusy(false);
    }
  }

  // Export/print товчны тоо: сонгосон байвал сонголтын тоо, эс бөгөөс нийт (шүүсэн).
  const outCount = selected.size > 0 ? selected.size : total;
  // Устгалын тойм (сонголттой үед): зөвхөн Хэвлээгүй устгагдана, бусад нь хамгаалагдсан.
  const selDeletableCount = [...selected.values()].filter((r) => r.status === "unprinted").length;
  const selProtectedCount = selected.size - selDeletableCount;

  return (
    <div className="space-y-4">
      {/* Үйлдлийн мөр */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm text-slate-600">
          {hasFilters ? t("epcTable.filtered") : t("common.total")} <strong>{total.toLocaleString()}</strong>
        </span>
        <div className="flex-1" />

        {/* Баганын нуух/гаргах сонгогч */}
        <div className="relative">
          <button
            onClick={() => setShowColPicker((s) => !s)}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            ⚙ {t("epcTable.columns")}
          </button>
          {showColPicker && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setShowColPicker(false)} />
              <div className="absolute right-0 z-20 mt-1 max-h-80 w-60 overflow-auto rounded-lg border border-slate-200 bg-white p-2 shadow-lg">
                <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {t("epcTable.visibleColumns")}
                </div>
                {columns.map((c) => (
                  <label
                    key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-sm text-slate-700 hover:bg-slate-50"
                  >
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.key)}
                      onChange={() => toggleColumn(c.key)}
                    />
                    {c.label}
                  </label>
                ))}
              </div>
            </>
          )}
        </div>

        {hasFilters && (
          <button
            onClick={clearFilters}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("epcTable.clearFilters")}
          </button>
        )}
        <button
          onClick={handleExport}
          disabled={busy || outCount === 0}
          className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
        >
          {t("epcTable.exportCsvN", { n: outCount.toLocaleString() })}
        </button>
        {can("act_print") && (
          <button
            onClick={openPrint}
            disabled={busy || outCount === 0}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
          >
            🖨 {t("epcTable.printN", { n: outCount.toLocaleString() })}
          </button>
        )}
        {isAdmin && (
          <select
            value=""
            disabled={busy || outCount === 0}
            onChange={(e) => {
              const v = e.target.value as EpcStatus;
              if (v) {
                setStatusNote("");
                setStatusModal(v);
              }
              e.target.value = "";
            }}
            title={t("epcTable.changeStatusTitle")}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <option value="">{t("epcTable.changeStatusN", { n: outCount.toLocaleString() })}</option>
            {/* "Шилжүүлж буй" гараар тохируулахгүй — зөвхөн Шилжүүлэг гүйлгээгээр (DB trigger ч хориглоно). */}
            {EPC_STATUSES.filter((s) => s !== "transferring").map((s) => (
              <option key={s} value={s}>
                → {STATUS_LABEL[s]}
              </option>
            ))}
          </select>
        )}
        {isAdmin && (
          <button
            onClick={() => setDeleteModal(true)}
            disabled={busy || outCount === 0}
            className="rounded-lg border border-red-300 bg-red-50 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-50"
          >
            {t("epcTable.deleteN", { n: outCount.toLocaleString() })}
          </button>
        )}
        {selected.size > 0 && (
          <button
            onClick={() => setSelected(new Map())}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            {t("epcTable.clearSelectionN", { n: selected.size })}
          </button>
        )}
        {(loading || busy) && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500">
            <svg className="h-4 w-4 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
            </svg>
            {busy ? t("epcTable.preparing") : t("common.loading")}
          </span>
        )}
      </div>

      {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}

      {/* Хүснэгт — толгой нь scroll үед дээрээ наалддаг (sticky), багана бүрд шүүлт/эрэмбэ */}
      <div className="max-h-[70vh] overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead>
            <tr>
              <th className="sticky top-0 z-10 border-b border-slate-200 bg-slate-50 px-2 py-2 align-top">
                <input
                  type="checkbox"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                  title={t("epcTable.selectPageAll")}
                />
              </th>
              {visibleColumns.map((c) => (
                <th
                  key={c.key}
                  className="sticky top-0 z-10 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left align-top last:border-r-0"
                >
                  <button
                    type="button"
                    onClick={() => toggleSort(c.key)}
                    className="mb-1 flex min-h-[32px] items-start gap-1 text-left text-xs font-semibold uppercase leading-4 tracking-wide text-slate-500 hover:text-indigo-600"
                    title={t("epcTable.sort")}
                  >
                    {c.label}
                    <span className="text-[10px] text-slate-400">
                      {sort?.key === c.key ? (sort.dir === "asc" ? "▲" : "▼") : "↕"}
                    </span>
                  </button>
                  {c.key === "status" ? (
                    <select
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      className="w-full min-w-[110px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    >
                      <option value="">{t("common.all")}</option>
                      {EPC_STATUSES.map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      value={filters[c.key] ?? ""}
                      onChange={(e) => setFilter(c.key, e.target.value)}
                      placeholder={t("epcTable.filterPlaceholder")}
                      className="w-full min-w-[90px] rounded border border-slate-200 px-2 py-1 text-xs font-normal normal-case outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {loading && visible.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-16 text-center">
                  <div className="flex flex-col items-center gap-3 text-slate-500">
                    <svg className="h-8 w-8 animate-spin text-indigo-500" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                    </svg>
                    <span className="text-sm font-medium">{t("epcTable.loadingEpcData")}</span>
                  </div>
                </td>
              </tr>
            ) : visible.length === 0 ? (
              <tr>
                <td colSpan={visibleColumns.length + 1} className="px-4 py-8 text-center text-slate-400">
                  {hasFilters ? t("epcTable.noFilterMatch") : t("epcTable.noEpc")}
                </td>
              </tr>
            ) : (
              visible.map((r) => (
                <tr key={r.id} className={"hover:bg-slate-50" + (selected.has(r.id) ? " bg-indigo-50" : "")}>
                  <td className="border-b border-slate-100 px-2 py-2 text-center">
                    <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggleRow(r)} />
                  </td>
                  {visibleColumns.map((c) => {
                    const v = c.get(r);
                    return (
                      <td
                        key={c.key}
                        className={
                          "whitespace-nowrap border-b border-r border-slate-100 px-3 py-2 text-xs text-slate-700 last:border-r-0" +
                          (c.mono ? " font-mono text-xs" : "")
                        }
                      >
                        {c.key === "status" ? (
                          <span
                            className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + badgeOf(r.status)}
                            title={r.printed_at ? t("epcTable.printedAt", { date: new Date(r.printed_at).toLocaleString() }) : undefined}
                          >
                            {labelOf(r.status)}
                          </span>
                        ) : c.key === "epc" ? (
                          <button
                            onClick={() => onLookup?.(r.epc_hex)}
                            className="font-mono text-xs text-indigo-600 hover:underline"
                            title={t("epcTable.viewHistory")}
                          >
                            {r.epc_hex}
                          </button>
                        ) : v ? (
                          c.money ? formatMoney(Number(v)) : v
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Хуудаслалт */}
      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 text-sm">
          <button
            onClick={() => goPage(0)}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            «
          </button>
          <button
            onClick={() => goPage(Math.max(0, safePage - 1))}
            disabled={safePage === 0}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {t("common.prev")}
          </button>
          <span className="px-2 text-slate-600">
            {t("epcTable.page")} <strong>{safePage + 1}</strong> / {pageCount.toLocaleString()}
          </span>
          <button
            onClick={() => goPage(Math.min(pageCount - 1, safePage + 1))}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-3 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            {t("common.next")}
          </button>
          <button
            onClick={() => goPage(pageCount - 1)}
            disabled={safePage >= pageCount - 1}
            className="rounded-lg border border-slate-300 px-2 py-1 text-slate-700 hover:bg-slate-50 disabled:opacity-40"
          >
            »
          </button>
        </div>
      )}

      {printRows && (
        <Suspense fallback={null}>
          <PrintDialog
            rows={printRows}
            onClose={() => setPrintRows(null)}
            onPrinted={() => markPrinted(printRows)}
          />
        </Suspense>
      )}

      {/* Устгах баталгаажуулалт — зөвхөн Хэвлээгүй устгагдана */}
      {deleteModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setDeleteModal(false)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">{t("epcTable.deleteTitle")}</h3>
            <p className="mt-2 text-sm text-slate-600">
              {selected.size > 0 ? (
                <Trans
                  i18nKey="epcTable.deleteBody"
                  values={{
                    selected: selected.size.toLocaleString(),
                    deletable: selDeletableCount.toLocaleString(),
                  }}
                  components={{ b: <strong />, r: <strong className="text-red-700" /> }}
                />
              ) : (
                <Trans
                  i18nKey="epcTable.deleteBodyFiltered"
                  values={{ n: total.toLocaleString() }}
                  components={{ b: <strong />, r: <strong className="text-red-700" /> }}
                />
              )}
            </p>
            {selected.size > 0 && selProtectedCount > 0 && (
              <p className="mt-1 text-xs text-amber-700">
                {t("epcTable.deleteProtectedNote", { n: selProtectedCount.toLocaleString() })}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">{t("epcTable.deleteSkipNote")}</p>
            <p className="mt-2 text-sm font-medium text-slate-800">
              {selected.size === 0 || selDeletableCount > 0
                ? t("epcTable.deleteConfirm")
                : t("epcTable.nothingDeletable")}
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setDeleteModal(false)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("epcTable.dismiss")}
              </button>
              <button
                disabled={busy || (selected.size > 0 && selDeletableCount === 0)}
                onClick={() => {
                  setDeleteModal(false);
                  void handleDelete();
                }}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t("epcTable.deleteN", {
                  n: (selected.size > 0 ? selDeletableCount : total).toLocaleString(),
                })}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Төлөв өөрчлөх баталгаажуулалт — Тэмдэглэлтэй (түүхэнд бичигдэнэ) */}
      {statusModal && (
        <div
          className="fixed inset-0 z-30 flex items-center justify-center bg-black/30 p-4"
          onClick={() => setStatusModal(null)}
        >
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="font-semibold text-slate-900">{t("epcTable.statusTitle")}</h3>
            <p className="mt-2 text-sm text-slate-600">
              <Trans
                i18nKey={selected.size > 0 ? "epcTable.statusBodySelected" : "epcTable.statusBodyFiltered"}
                values={{ n: outCount.toLocaleString(), status: STATUS_LABEL[statusModal] }}
                components={{
                  b: <strong />,
                  s: (
                    <span
                      className={"whitespace-nowrap rounded px-2 py-0.5 text-xs font-medium " + badgeOf(statusModal)}
                    />
                  ),
                }}
              />
            </p>
            <label className="mt-3 block text-sm">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
                {t("common.note")}
              </span>
              <input
                autoFocus
                value={statusNote}
                onChange={(e) => setStatusNote(e.target.value)}
                placeholder={t("epcTable.notePlaceholder")}
                className="w-full rounded border border-slate-300 px-2 py-1.5 text-sm outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-200"
              />
            </label>
            <div className="mt-4 flex justify-end gap-2">
              <button
                onClick={() => setStatusModal(null)}
                className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
              >
                {t("epcTable.dismiss")}
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  const target = statusModal;
                  setStatusModal(null);
                  void changeStatus(target, statusNote);
                }}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
              >
                {t("epcTable.change")}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
