// ============================================================
// Тайлан — Орлого (inflow). Интервалд шинээр үүссэн EPC = орж ирсэн бараа
// (бүх үүсгэлтийн зам, төлөв үл хамааран; устгагдсан нь автоматаар орохгүй).
// DB талд нэгтгэсэн жижиг үр дүнг report_inflow RPC-ээс татаж, бүлэглэлтийг
// client талд pivot хийнэ (report_sales-тай ижил хэв маяг). Дүн = ширхэг ×
// барааны ОДООГИЙН үнэ (үүсгэх үед үнийн snapshot байдаггүй).
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";
import type { ProductRow } from "./products";

export interface InflowRow {
  day: string; // 'YYYY-MM-DD'
  branch_id: string | null;
  product_id: string;
  job_number: string | null;
  supplier: string | null;
  qty: number;
}

/** Интервалын орлогын нэгтгэл (өдөр × салбар × бараа × ажил). from/to = 'YYYY-MM-DD'. */
export async function fetchInflowReport(from: string, to: string): Promise<InflowRow[]> {
  const { data, error } = await supabase.rpc("report_inflow", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as InflowRow[]).map((r) => ({ ...r, qty: Number(r.qty) }));
}

export type InflowGroup = "day" | "month" | "branch" | "product" | "job" | "supplier";

export const INFLOW_GROUP_LABEL: Record<InflowGroup, string> = labelMap({
  day: "reports.groupDay",
  month: "reports.groupMonth",
  branch: "reports.groupBranch",
  product: "reports.groupProduct",
  job: "reports.groupJob",
  supplier: "reports.groupSupplier",
});

export interface GroupedInflow {
  key: string;
  label: string;
  sub: string | null; // бараагаар үед SKU, ажлаар үед нийлүүлэгч
  qty: number;
  value: number; // qty × одоогийн үнэ (үнэгүй бараа 0-ээр)
  noPriceQty: number; // үнэгүй барааны ширхэг (дүнд ороогүй)
}

export interface InflowMaps {
  branchName: Map<string, string>;
  products: Map<string, ProductRow>;
}

/** Нэгтгэсэн мөрүүдийг сонгосон түвшингээр бүлэглэнэ (эрэмбэтэй). */
export function groupInflow(rows: InflowRow[], group: InflowGroup, maps: InflowMaps): GroupedInflow[] {
  const acc = new Map<string, GroupedInflow>();
  for (const r of rows) {
    const p = maps.products.get(r.product_id);
    const price = p?.price ?? null;
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
      case "job":
        key = r.job_number ?? "__none__";
        label = r.job_number ?? i18n.t("reports.noJob");
        sub = r.supplier ?? null;
        break;
      case "supplier":
        key = r.supplier ?? "__none__";
        label = r.supplier ?? i18n.t("reports.noSupplier");
        break;
      default: {
        key = r.product_id;
        label = p?.name || p?.sku || i18n.t("reports.unnamedProduct");
        sub = p?.sku ?? null;
      }
    }
    const cur = acc.get(key) ?? { key, label, sub, qty: 0, value: 0, noPriceQty: 0 };
    cur.qty += r.qty;
    if (price != null) cur.value += r.qty * price;
    else cur.noPriceQty += r.qty;
    acc.set(key, cur);
  }
  const out = [...acc.values()];
  // Он цагийн бүлэглэлт — хугацааны дараалал; бусад нь — дүнгээр буурах.
  if (group === "day" || group === "month") out.sort((a, b) => a.key.localeCompare(b.key));
  else out.sort((a, b) => b.value - a.value || b.qty - a.qty);
  return out;
}
