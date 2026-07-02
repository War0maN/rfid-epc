// ============================================================
// Үлдэгдэл (Phase 4) — Идэвхтэй (active) EPC-ийн тоо, бараа × салбараар.
//   stock_by_branch view-аас урт хэлбэрээр татаад component дотор pivot хийнэ.
//   RLS-ийн ачаар зөвхөн өөрийн тенант.
// ============================================================
import { supabase } from "./supabaseClient";

/** Салбаргүй (branch_id = null) active EPC-ийн баганын түлхүүр. */
export const NO_BRANCH_KEY = "__none__";

export interface StockCell {
  product_id: string;
  branch_id: string | null;
  qty: number;
}

/** Бараа × салбар тус бүрийн Идэвхтэй EPC тоо (урт хэлбэр). */
export async function fetchStockByBranch(): Promise<StockCell[]> {
  const { data, error } = await supabase
    .from("stock_by_branch")
    .select("product_id, branch_id, qty");
  if (error) throw error;
  return (data ?? []) as StockCell[];
}

/** Урт хэлбэрийг pivot болгоно: product_id → (branchKey → qty). null салбар → NO_BRANCH_KEY. */
export function pivotStock(cells: StockCell[]): Map<string, Map<string, number>> {
  const byProduct = new Map<string, Map<string, number>>();
  for (const c of cells) {
    const key = c.branch_id ?? NO_BRANCH_KEY;
    let row = byProduct.get(c.product_id);
    if (!row) {
      row = new Map();
      byProduct.set(c.product_id, row);
    }
    row.set(key, (row.get(key) ?? 0) + c.qty);
  }
  return byProduct;
}

export interface ActiveEpc {
  id: string;
  epc_hex: string;
  serial: number;
  created_at: string; // үүссэн (ирсэн) хугацаа
}

/** Тухайн бараа × салбарын Идэвхтэй EPC-ийн жагсаалт (модалд). branchId null = Салбаргүй. */
export async function fetchActiveEpcs(productId: string, branchId: string | null): Promise<ActiveEpc[]> {
  let q = supabase
    .from("epc_full")
    .select("id, epc_hex, serial, created_at")
    .eq("product_id", productId)
    .eq("status", "active")
    .order("serial", { ascending: true });
  q = branchId == null ? q.is("branch_id", null) : q.eq("branch_id", branchId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ActiveEpc[];
}
