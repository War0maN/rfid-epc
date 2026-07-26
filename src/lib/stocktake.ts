// ============================================================
// Тооллого (Ү3) — салбарын Идэвхтэй EPC-г бодит байдалтай тулгах.
//   Үүсгэхэд snapshot хөлдөнө; уншилт hex-ээр шууд тулгагдана (idempotent);
//   хаасны дараа дутууг change_epc_status-аар (тэмдэглэлтэй) актална —
//   тооллого өөрөө юуг ч өөрчилдөггүй.
// ============================================================
import { supabase } from "./supabaseClient";

export type StocktakeStatus = "open" | "closed";

export interface StocktakeListItem {
  id: string;
  number: string;
  status: StocktakeStatus;
  branch_id: string;
  note: string | null;
  created_at: string;
  closed_at: string | null;
  branch_name: string;
}

export const STOCKTAKE_OUTCOMES = ["found", "not_expected", "unknown"] as const;
export type StocktakeOutcome = (typeof STOCKTAKE_OUTCOMES)[number];

export interface StocktakeScanCounts extends Partial<Record<StocktakeOutcome, number>> {
  skipped?: number;
}

export interface StocktakeProgressRow {
  product_id: string;
  expected: number;
  found: number;
  name: string | null;
  sku: string | null;
  gtin: string | null;
}

/** Илүү олдсон/танигдаагүй уншилт — барааны мэдээлэл + одоогийн төлөвтэй нь.
 *  Төлөв нь ЯАГААД илүү болохыг тайлбарлана: Борлуулсан (шошго хаягдсан),
 *  Бусад гүйлгээ (актлаад хадгалсан), өөр салбарын Идэвхтэй г.м. */
export interface StocktakeExtraDetail {
  epc_hex: string;
  outcome: StocktakeOutcome;
  name: string | null;
  sku: string | null;
  gtin: string | null;
  status: string | null; // epcStatus код (unknown таг-д null)
  branch_id: string | null;
}

export interface MissingEpc {
  epc_id: string;
  epc_hex: string;
  product_id: string;
}

export async function listStocktakes(): Promise<StocktakeListItem[]> {
  const { data, error } = await supabase
    .from("stocktakes")
    .select("id, number, status, branch_id, note, created_at, closed_at, branches(name)")
    .order("created_at", { ascending: false });
  if (error) throw error;
  type Row = Omit<StocktakeListItem, "branch_name"> & { branches: { name: string } | null };
  return ((data ?? []) as unknown as Row[]).map((r) => ({
    ...r,
    branch_name: r.branches?.name ?? "?",
  }));
}

export async function createStocktake(branchId: string, note?: string): Promise<string> {
  const { data, error } = await supabase.rpc("create_stocktake", {
    p_branch: branchId,
    p_note: note ?? null,
  });
  if (error) throw error;
  return data as string;
}

/** Уншсан hex-үүдийг багцаар илгээнэ (idempotent — дахин илгээхэд аюулгүй). */
export async function submitStocktakeScans(
  stocktakeId: string,
  hexes: string[]
): Promise<StocktakeScanCounts> {
  const total: StocktakeScanCounts = {};
  for (let i = 0; i < hexes.length; i += 500) {
    const { data, error } = await supabase.rpc("stocktake_scan", {
      p_stocktake: stocktakeId,
      p_hexes: hexes.slice(i, i + 500),
    });
    if (error) throw error;
    const counts = (data ?? {}) as Record<string, number>;
    for (const [k, v] of Object.entries(counts)) {
      total[k as keyof StocktakeScanCounts] = (total[k as keyof StocktakeScanCounts] ?? 0) + v;
    }
  }
  return total;
}

/** Явц (бараагаар) — нэр/SKU-гаар баяжуулсан, дутуу ихтэй нь эхэндээ. */
export async function fetchStocktakeProgress(stocktakeId: string): Promise<StocktakeProgressRow[]> {
  const { data, error } = await supabase
    .from("stocktake_progress")
    .select("product_id, expected, found")
    .eq("stocktake_id", stocktakeId);
  if (error) throw error;
  const rows = (data ?? []) as { product_id: string; expected: number; found: number }[];
  if (rows.length === 0) return [];

  const { data: prods, error: pErr } = await supabase
    .from("products")
    .select("id, name, sku, gtin")
    .in("id", rows.map((r) => r.product_id));
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
    .sort((a, b) => (b.expected - b.found) - (a.expected - a.found) || (a.name ?? "").localeCompare(b.name ?? ""));
}

/** Илүү олдсон/танигдаагүй уншилтууд — бараа + одоогийн төлөв/салбартай нь. */
export async function fetchStocktakeExtras(stocktakeId: string): Promise<StocktakeExtraDetail[]> {
  const { data, error } = await supabase
    .from("stocktake_scans")
    .select("epc_hex, outcome, epc_id, product_id")
    .eq("stocktake_id", stocktakeId)
    .neq("outcome", "found")
    .order("scanned_at", { ascending: false });
  if (error) throw error;
  const scans = (data ?? []) as {
    epc_hex: string; outcome: StocktakeOutcome; epc_id: string | null; product_id: string | null;
  }[];
  if (scans.length === 0) return [];

  const epcIds = scans.map((s) => s.epc_id).filter((x): x is string => !!x);
  const epcMap = new Map<string, { status: string; branch_id: string | null; product_id: string }>();
  for (let i = 0; i < epcIds.length; i += 500) {
    const { data: epcs, error: eErr } = await supabase
      .from("epc_codes")
      .select("id, status, branch_id, product_id")
      .in("id", epcIds.slice(i, i + 500));
    if (eErr) throw eErr;
    for (const e of (epcs ?? []) as { id: string; status: string; branch_id: string | null; product_id: string }[]) {
      epcMap.set(e.id, e);
    }
  }

  const prodIds = [...new Set([...epcMap.values()].map((e) => e.product_id))];
  const pMap = new Map<string, { name: string | null; sku: string | null; gtin: string | null }>();
  if (prodIds.length > 0) {
    const { data: prods, error: pErr } = await supabase
      .from("products")
      .select("id, name, sku, gtin")
      .in("id", prodIds);
    if (pErr) throw pErr;
    for (const p of (prods ?? []) as { id: string; name: string | null; sku: string | null; gtin: string | null }[]) {
      pMap.set(p.id, p);
    }
  }

  return scans.map((s) => {
    const e = s.epc_id ? epcMap.get(s.epc_id) : undefined;
    const p = e ? pMap.get(e.product_id) : undefined;
    return {
      epc_hex: s.epc_hex,
      outcome: s.outcome,
      name: p?.name ?? null,
      sku: p?.sku ?? null,
      gtin: p?.gtin ?? null,
      status: e?.status ?? null,
      branch_id: e?.branch_id ?? null,
    };
  });
}

/** Дутуу (тоологдоогүй) EPC-үүд — cap-тай (жагсаалт харуулах + актлахад). */
export async function fetchMissing(stocktakeId: string, cap = 10000): Promise<MissingEpc[]> {
  const PAGE = 1000;
  const out: MissingEpc[] = [];
  for (let from = 0; from < cap; from += PAGE) {
    const { data, error } = await supabase
      .from("stocktake_missing")
      .select("epc_id, epc_hex, product_id")
      .eq("stocktake_id", stocktakeId)
      .order("epc_hex")
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = (data ?? []) as MissingEpc[];
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

export async function closeStocktake(stocktakeId: string): Promise<void> {
  const { error } = await supabase.rpc("close_stocktake", { p_stocktake: stocktakeId });
  if (error) throw error;
}

/**
 * Дутууг "Бусад гүйлгээ" болгож актална (зөвхөн админ — change_epc_status
 * дотроо шалгана). Жинхэнэ гүйлгээ үүсч түүхэнд тэмдэглэлтэй бичигдэнэ.
 */
export async function writeOffMissing(epcIds: string[], reason: string): Promise<number> {
  let done = 0;
  for (let i = 0; i < epcIds.length; i += 500) {
    const { data, error } = await supabase.rpc("change_epc_status", {
      p_ids: epcIds.slice(i, i + 500),
      p_status: "other",
      p_reason: reason,
    });
    if (error) throw error;
    done += (data as number) ?? 0;
  }
  return done;
}
