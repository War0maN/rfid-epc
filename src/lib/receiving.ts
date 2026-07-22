// ============================================================
// Хүлээн авалт (Ү2) — үйлдвэрээс RFID таг-тай ирсэн барааг бүртгэх.
//   Packing list → create_receipt RPC (хүлээгдэх мөрүүд) → уншсан EPC-г
//   receive_scans RPC-ээр задалж-тулгаж бүртгэнэ (idempotent) → хаахдаа
//   таг-гүй үлдэгдэлд EPC үүсгэж болно (ижил job — generateEpcsForJob).
// ============================================================
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase } from "./supabaseClient";
import { parseAndUpsertProducts } from "./importPackingList";
import { generateEpcsForJob } from "./generateEpcs";

export type ReceiptStatus = "open" | "closed";

export interface ReceiptListItem {
  id: string;
  status: ReceiptStatus;
  branch_id: string;
  created_at: string;
  closed_at: string | null;
  job_id: string;
  job_number: string;
  arrival_date: string;
  supplier: string | null;
  note: string | null;
  branch_name: string;
}

/** Уншилтын ангиллын түлхүүрүүд (receive_scans RPC-ийн outcome-той ижил). */
export const SCAN_OUTCOMES = [
  "matched",
  "already_registered",
  "unknown_gtin",
  "not_on_list",
  "undecodable",
  "serial_conflict",
] as const;
export type ScanOutcome = (typeof SCAN_OUTCOMES)[number];

export interface ScanCounts extends Partial<Record<ScanOutcome, number>> {
  skipped?: number;
}

export interface ProgressRow {
  product_id: string;
  expected: number;
  scanned: number;
  generated: number;
  /** name/sku нь products-оос нэмж баяжуулагдана */
  name: string | null;
  sku: string | null;
  gtin: string | null;
}

export interface ScanIssue {
  epc_hex: string;
  outcome: ScanOutcome;
  product_id: string | null;
  scanned_at: string;
}

export async function listReceipts(): Promise<ReceiptListItem[]> {
  const { data, error } = await supabase
    .from("receipts")
    .select(
      "id, status, branch_id, created_at, closed_at, job_id, jobs(job_number, arrival_date, supplier, note), branches(name)"
    )
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Row = {
    id: string; status: ReceiptStatus; branch_id: string; created_at: string;
    closed_at: string | null; job_id: string;
    jobs: { job_number: string; arrival_date: string; supplier: string | null; note: string | null } | null;
    branches: { name: string } | null;
  };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    id: r.id,
    status: r.status,
    branch_id: r.branch_id,
    created_at: r.created_at,
    closed_at: r.closed_at,
    job_id: r.job_id,
    job_number: r.jobs?.job_number ?? "?",
    arrival_date: r.jobs?.arrival_date ?? "",
    supplier: r.jobs?.supplier ?? null,
    note: r.jobs?.note ?? null,
    branch_name: r.branches?.name ?? "?",
  }));
}

/**
 * Excel-ээс хүлээн авах ажил үүсгэнэ: бараануудыг upsert хийж (импорттой
 * ижил суурь), (бараа, хайрцаг) бүрээр тоог нэгтгэж create_receipt RPC дуудна.
 * Салбар нэг (бүх ачаа нэг газар буудаг) — Excel-ийн branch багана энд үл хэрэглэгдэнэ.
 */
export async function createReceiptFromXlsx(
  sb: SupabaseClient,
  file: Blob,
  params: {
    branchId: string;
    arrivalDate: string; // 'YYYY-MM-DD'
    supplier?: string;
    note?: string;
    number?: string; // хоосон бол RCV-0001 дэс автоматаар
  }
): Promise<{ receiptId: string; lineCount: number; productCount: number; expectedTotal: number; skipped: string[] }> {
  const { rows, skipped, productCount } = await parseAndUpsertProducts(sb, file);

  // (product, box) бүрээр нэгтгэнэ
  const lineMap = new Map<string, { product_id: string; expected: number; box_no: string | null }>();
  for (const r of rows) {
    const key = `${r.productId}|${r.boxNo ?? ""}`;
    const cur = lineMap.get(key);
    if (cur) cur.expected += r.piece;
    else lineMap.set(key, { product_id: r.productId, expected: r.piece, box_no: r.boxNo });
  }
  const lines = [...lineMap.values()];

  const { data, error } = await sb.rpc("create_receipt", {
    p_branch: params.branchId,
    p_arrival: params.arrivalDate,
    p_supplier: params.supplier ?? null,
    p_note: params.note ?? null,
    p_number: params.number?.trim() || null,
    p_lines: lines,
  });
  if (error) throw error;
  return {
    receiptId: data as string,
    lineCount: lines.length,
    productCount,
    expectedTotal: lines.reduce((s, l) => s + l.expected, 0),
    skipped,
  };
}

/** Уншсан hex-үүдийг багцаар (500) илгээнэ — RPC idempotent тул дахин илгээхэд аюулгүй. */
export async function submitScans(receiptId: string, hexes: string[]): Promise<ScanCounts> {
  const total: ScanCounts = {};
  for (let i = 0; i < hexes.length; i += 500) {
    const { data, error } = await supabase.rpc("receive_scans", {
      p_receipt: receiptId,
      p_hexes: hexes.slice(i, i + 500),
    });
    if (error) throw error;
    const counts = (data ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(counts)) {
      total[k as keyof ScanCounts] = (total[k as keyof ScanCounts] ?? 0) + v;
    }
  }
  return total;
}

/** Явцын тойм (бараагаар) — нэр/SKU-гаар баяжуулсан. */
export async function fetchProgress(receiptId: string): Promise<ProgressRow[]> {
  const { data, error } = await supabase
    .from("receipt_progress")
    .select("product_id, expected, scanned, generated")
    .eq("receipt_id", receiptId);
  if (error) throw error;
  const rows = (data ?? []) as { product_id: string; expected: number; scanned: number; generated: number }[];
  if (rows.length === 0) return [];

  const ids = rows.map((r) => r.product_id);
  const { data: prods, error: pErr } = await supabase
    .from("products")
    .select("id, name, sku, gtin")
    .in("id", ids);
  if (pErr) throw pErr;
  const pMap = new Map(
    ((prods ?? []) as { id: string; name: string | null; sku: string | null; gtin: string | null }[]).map(
      (p) => [p.id, p]
    )
  );
  return rows
    .map((r) => ({
      ...r,
      name: pMap.get(r.product_id)?.name ?? null,
      sku: pMap.get(r.product_id)?.sku ?? null,
      gtin: pMap.get(r.product_id)?.gtin ?? null,
    }))
    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Асуудалтай уншилтууд (matched-аас бусад нь) — тайлбарлаж харуулахад. */
export async function fetchScanIssues(receiptId: string): Promise<ScanIssue[]> {
  const { data, error } = await supabase
    .from("receipt_scans")
    .select("epc_hex, outcome, product_id, scanned_at")
    .eq("receipt_id", receiptId)
    .neq("outcome", "matched")
    .order("scanned_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ScanIssue[];
}

/**
 * Таг-гүй үлдэгдэлд EPC үүсгэнэ (Хэвлээгүй — дараа нь хэвлэж наана).
 * Ижил job-д бүлэглэгдэх тул Ажлын №/Нийлүүлэгч нь адилхан харагдана.
 */
export async function generateForRemainder(
  sb: SupabaseClient,
  jobId: string,
  branchId: string,
  lines: { productId: string; count: number }[]
): Promise<number> {
  const epcs = await generateEpcsForJob(sb, {
    jobId,
    lines: lines.filter((l) => l.count >= 1),
    branchId,
  });
  return epcs.length;
}

export async function closeReceipt(receiptId: string): Promise<void> {
  const { error } = await supabase.rpc("close_receipt", { p_receipt: receiptId });
  if (error) throw error;
}
