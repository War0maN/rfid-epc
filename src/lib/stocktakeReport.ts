// ============================================================
// Тайлан — Тооллогын зөрүү (shrinkage). Хаагдсан тооллогуудын нэгтгэлийг
// report_stocktake RPC-ээс (тооллого × бараа түвшинд) татаж, бүлэглэлтийг
// client талд pivot хийнэ (report_sales/report_inflow-той ижил хэв маяг).
// Дутуу = бүртгэлтэй − тоологдсон; дутуугийн дүн = барааны ОДООГИЙН үнэ.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";
import type { ProductRow } from "./products";

export interface StocktakeRow {
  stocktake_id: string;
  number: string;
  branch_id: string;
  closed_at: string;
  product_id: string;
  expected: number;
  found: number;
  extra: number;
}

/** Интервалд хаагдсан тооллогуудын нэгтгэл (тооллого × бараа). from/to = 'YYYY-MM-DD'. */
export async function fetchStocktakeReport(from: string, to: string): Promise<StocktakeRow[]> {
  const { data, error } = await supabase.rpc("report_stocktake", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as StocktakeRow[]).map((r) => ({
    ...r,
    expected: Number(r.expected),
    found: Number(r.found),
    extra: Number(r.extra),
  }));
}

export type StocktakeGroup = "stocktake" | "branch" | "month" | "product";

export const ST_GROUP_LABEL: Record<StocktakeGroup, string> = labelMap({
  stocktake: "reports.groupStocktake",
  branch: "reports.groupBranch",
  month: "reports.groupMonth",
  product: "reports.groupProduct",
});

export interface GroupedStocktake {
  key: string;
  label: string;
  sub: string | null; // тооллогоор үед салбар + огноо, бараагаар үед SKU
  expected: number;
  found: number;
  missing: number; // expected - found
  extra: number;
  missingValue: number; // дутуу × одоогийн үнэ (үнэгүй бараа 0-ээр)
  noPriceMissing: number; // үнэгүй барааны дутуу ширхэг (дүнд ороогүй)
}

export interface StocktakeMaps {
  branchName: Map<string, string>;
  products: Map<string, ProductRow>;
}

/** Нэгтгэсэн мөрүүдийг сонгосон түвшингээр бүлэглэнэ (дутуугийн дүнгээр буурах). */
export function groupStocktake(
  rows: StocktakeRow[],
  group: StocktakeGroup,
  maps: StocktakeMaps
): GroupedStocktake[] {
  const acc = new Map<string, GroupedStocktake>();
  for (const r of rows) {
    const p = maps.products.get(r.product_id);
    const price = p?.price ?? null;
    const missing = r.expected - r.found;
    let key: string;
    let label: string;
    let sub: string | null = null;
    switch (group) {
      case "stocktake":
        key = r.stocktake_id;
        label = r.number;
        sub = `${maps.branchName.get(r.branch_id) ?? "?"} · ${r.closed_at.slice(0, 10)}`;
        break;
      case "branch":
        key = r.branch_id;
        label = maps.branchName.get(r.branch_id) ?? "?";
        break;
      case "month":
        key = r.closed_at.slice(0, 7);
        label = key;
        break;
      default: {
        key = r.product_id;
        label = p?.name || p?.sku || i18n.t("reports.unnamedProduct");
        sub = p?.sku ?? null;
      }
    }
    const cur = acc.get(key) ?? {
      key,
      label,
      sub,
      expected: 0,
      found: 0,
      missing: 0,
      extra: 0,
      missingValue: 0,
      noPriceMissing: 0,
    };
    cur.expected += r.expected;
    cur.found += r.found;
    cur.missing += missing;
    cur.extra += r.extra;
    if (price != null) cur.missingValue += missing * price;
    else cur.noPriceMissing += missing;
    acc.set(key, cur);
  }
  const out = [...acc.values()];
  if (group === "month") out.sort((a, b) => a.key.localeCompare(b.key));
  else out.sort((a, b) => b.missingValue - a.missingValue || b.missing - a.missing);
  return out;
}
