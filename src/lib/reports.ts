// ============================================================
// Тайлан (Phase 6) — Борлуулалт. DB талд (өдөр × салбар × бараа)
// түвшинд нэгтгэсэн жижиг үр дүнг татаж (report_sales RPC), бүлэглэлтийг
// client талд pivot хийнэ — бүлэглэлт солиход дахин татахгүй.
// ============================================================
import { supabase } from "./supabaseClient";

export interface SalesRow {
  day: string; // 'YYYY-MM-DD'
  branch_id: string | null;
  product_id: string;
  actor_id: string | null; // хэн борлуулсан (гүйлгээ хийсэн/төлөв өөрчилсөн)
  qty: number;
  amount: number;
}

/** Интервалын борлуулалтын нэгтгэл (өдөр × салбар × бараа). from/to = 'YYYY-MM-DD'. */
export async function fetchSalesReport(from: string, to: string): Promise<SalesRow[]> {
  const { data, error } = await supabase.rpc("report_sales", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as SalesRow[]).map((r) => ({ ...r, qty: Number(r.qty), amount: Number(r.amount) }));
}

/** Интервалын борлуулалтын ГҮЙЛГЭЭНИЙ тоо (нийлбэр картад). */
export async function fetchSalesTxCount(from: string, to: string): Promise<number> {
  const { count, error } = await supabase
    .from("transactions")
    .select("id", { count: "exact", head: true })
    .eq("type", "sale")
    .eq("status", "done")
    .gte("created_at", from)
    .lt("created_at", nextDay(to));
  if (error) throw error;
  return count ?? 0;
}

function nextDay(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export type SalesGroup = "day" | "month" | "branch" | "product" | "user";

export const GROUP_LABEL: Record<SalesGroup, string> = {
  day: "Өдрөөр",
  month: "Сараар",
  branch: "Салбараар",
  product: "Бараагаар",
  user: "Хэрэглэгчээр",
};

export interface GroupedSales {
  key: string;
  label: string;
  sub: string | null; // бараагаар үед SKU
  qty: number;
  amount: number;
}

export interface NameMaps {
  branchName: Map<string, string>;
  productName: Map<string, { name: string | null; sku: string | null }>;
  userEmail: Map<string, string | null>;
}

/** Нэгтгэсэн мөрүүдийг сонгосон түвшингээр бүлэглэнэ (эрэмбэтэй). */
export function groupSales(rows: SalesRow[], group: SalesGroup, maps: NameMaps): GroupedSales[] {
  const acc = new Map<string, GroupedSales>();
  for (const r of rows) {
    let key: string;
    let label: string;
    let sub: string | null = null;
    switch (group) {
      case "day":
        key = r.day;
        label = r.day;
        break;
      case "month":
        key = r.day.slice(0, 7);
        label = key;
        break;
      case "branch":
        key = r.branch_id ?? "__none__";
        label = r.branch_id ? (maps.branchName.get(r.branch_id) ?? "?") : "(Салбаргүй)";
        break;
      case "user":
        key = r.actor_id ?? "__none__";
        label = r.actor_id ? (maps.userEmail.get(r.actor_id) ?? "?") : "(Тодорхойгүй)";
        break;
      default: {
        key = r.product_id;
        const p = maps.productName.get(r.product_id);
        label = p?.name || p?.sku || "Нэргүй бараа";
        sub = p?.sku ?? null;
      }
    }
    const cur = acc.get(key);
    if (cur) {
      cur.qty += r.qty;
      cur.amount += r.amount;
    } else {
      acc.set(key, { key, label, sub, qty: r.qty, amount: r.amount });
    }
  }
  const out = [...acc.values()];
  // Он цагийн бүлэглэлт — хугацааны дараалал; бусад нь — дүнгээр буурах.
  if (group === "day" || group === "month") out.sort((a, b) => a.key.localeCompare(b.key));
  else out.sort((a, b) => b.amount - a.amount);
  return out;
}
