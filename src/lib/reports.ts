// ============================================================
// Тайлан (Phase 6) — Борлуулалт. DB талд (өдөр × салбар × бараа)
// түвшинд нэгтгэсэн жижиг үр дүнг татаж (report_sales RPC), бүлэглэлтийг
// client талд pivot хийнэ — бүлэглэлт солиход дахин татахгүй.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";

export interface SalesRow {
  day: string; // 'YYYY-MM-DD'
  branch_id: string | null;
  product_id: string;
  actor_id: string | null; // хэн борлуулсан (гүйлгээ хийсэн/төлөв өөрчилсөн)
  qty: number;
  amount: number;
  // Буцаалт — буцаасан өдрөөр нь (тухайн өдрийн цэвэр дүн сөрөг байж болно).
  ret_qty: number;
  ret_amount: number;
}

/** Интервалын борлуулалт+буцаалтын нэгтгэл (өдөр × салбар × бараа). from/to = 'YYYY-MM-DD'. */
export async function fetchSalesReport(from: string, to: string): Promise<SalesRow[]> {
  const { data, error } = await supabase.rpc("report_sales", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as SalesRow[]).map((r) => ({
    ...r,
    qty: Number(r.qty),
    amount: Number(r.amount),
    ret_qty: Number(r.ret_qty ?? 0),
    ret_amount: Number(r.ret_amount ?? 0),
  }));
}

export interface TxCounts {
  sale: number;
  ret: number;
}

/** Интервалын борлуулалт/буцаалтын ГҮЙЛГЭЭНИЙ тоо (нийлбэр картад). */
export async function fetchSalesTxCounts(from: string, to: string): Promise<TxCounts> {
  const countOf = async (type: string) => {
    const { count, error } = await supabase
      .from("transactions")
      .select("id", { count: "exact", head: true })
      .eq("type", type)
      .eq("status", "done")
      .gte("created_at", from)
      .lt("created_at", nextDay(to));
    if (error) throw error;
    return count ?? 0;
  };
  const [sale, ret] = await Promise.all([countOf("sale"), countOf("return")]);
  return { sale, ret };
}

function nextDay(d: string): string {
  const t = new Date(d + "T00:00:00Z");
  t.setUTCDate(t.getUTCDate() + 1);
  return t.toISOString().slice(0, 10);
}

export type SalesGroup = "day" | "month" | "branch" | "product" | "user";

export const GROUP_LABEL: Record<SalesGroup, string> = labelMap({
  day: "reports.groupDay",
  month: "reports.groupMonth",
  branch: "reports.groupBranch",
  product: "reports.groupProduct",
  user: "reports.groupUser",
});

export interface GroupedSales {
  key: string;
  label: string;
  sub: string | null; // бараагаар үед SKU
  qty: number;
  amount: number;
  retQty: number;
  retAmount: number;
  netQty: number; // qty - retQty
  netAmount: number; // amount - retAmount
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
        label = r.branch_id ? (maps.branchName.get(r.branch_id) ?? "?") : i18n.t("reports.noBranch");
        break;
      case "user":
        key = r.actor_id ?? "__none__";
        label = r.actor_id ? (maps.userEmail.get(r.actor_id) ?? "?") : i18n.t("reports.unknownUser");
        break;
      default: {
        key = r.product_id;
        const p = maps.productName.get(r.product_id);
        label = p?.name || p?.sku || i18n.t("reports.unnamedProduct");
        sub = p?.sku ?? null;
      }
    }
    const cur = acc.get(key);
    if (cur) {
      cur.qty += r.qty;
      cur.amount += r.amount;
      cur.retQty += r.ret_qty;
      cur.retAmount += r.ret_amount;
    } else {
      acc.set(key, {
        key,
        label,
        sub,
        qty: r.qty,
        amount: r.amount,
        retQty: r.ret_qty,
        retAmount: r.ret_amount,
        netQty: 0,
        netAmount: 0,
      });
    }
  }
  const out = [...acc.values()];
  for (const g of out) {
    g.netQty = g.qty - g.retQty;
    g.netAmount = g.amount - g.retAmount;
  }
  // Он цагийн бүлэглэлт — хугацааны дараалал; бусад нь — цэвэр дүнгээр буурах.
  if (group === "day" || group === "month") out.sort((a, b) => a.key.localeCompare(b.key));
  else out.sort((a, b) => b.netAmount - a.netAmount);
  return out;
}
