// ============================================================
// Тайлан — Үлдэгдлийн үнэлгээ. Идэвхтэй EPC-ийн тоо (stock_by_branch)
// × одоогийн үнэ (products_full.price) = өнөөдрийн байдлаарх хөрөнгийн
// үнэлгээ. Бүх өгөгдөл байгаа view-үүдээс (RLS + салбарын scoping
// автоматаар үйлчилнэ) — шинэ DB объект шаардлагагүй, бүлэглэлт client талд.
// ============================================================
import { fetchStockByBranch, type StockCell } from "./inventory";
import { listProducts, type ProductRow } from "./products";
import { listBranches, type Branch } from "./branches";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";

export type ValuationGroup = "branch" | "category" | "product";

export const VAL_GROUP_LABEL: Record<ValuationGroup, string> = labelMap({
  branch: "reports.groupBranch",
  category: "reports.groupCategory",
  product: "reports.groupProduct",
});

export interface ValuationData {
  cells: StockCell[];
  products: Map<string, ProductRow>;
  branchName: Map<string, string>;
}

export async function fetchValuation(): Promise<ValuationData> {
  const [cells, products, branches] = await Promise.all([
    fetchStockByBranch(),
    listProducts(),
    listBranches(),
  ]);
  return {
    cells,
    products: new Map(products.map((p) => [p.id, p])),
    branchName: new Map(branches.map((b: Branch) => [b.id, b.name])),
  };
}

export interface ValuationRow {
  key: string;
  label: string;
  sub: string | null; // бараагаар үед SKU
  qty: number; // идэвхтэй ширхэг
  value: number; // qty × үнэ (үнэгүй бараа 0-ээр)
  noPriceQty: number; // үнэгүй барааны ширхэг (дүнд ороогүй)
}

/** Идэвхтэй үлдэгдлийг сонгосон түвшингээр бүлэглэж үнэлнэ (дүнгээр буурах эрэмбэ). */
export function groupValuation(data: ValuationData, group: ValuationGroup): ValuationRow[] {
  const acc = new Map<string, ValuationRow>();
  for (const c of data.cells) {
    const p = data.products.get(c.product_id);
    const price = p?.price ?? null;
    let key: string;
    let label: string;
    let sub: string | null = null;
    switch (group) {
      case "branch":
        key = c.branch_id ?? "__none__";
        label = c.branch_id
          ? (data.branchName.get(c.branch_id) ?? "?")
          : i18n.t("reports.noBranch");
        break;
      case "category":
        key = p?.category_l1 ?? "__none__";
        label = p?.category_l1 ?? i18n.t("reports.noCategory");
        break;
      default: {
        key = c.product_id;
        label = p?.name || p?.sku || i18n.t("reports.unnamedProduct");
        sub = p?.sku ?? null;
      }
    }
    const cur = acc.get(key) ?? {
      key,
      label,
      sub,
      qty: 0,
      value: 0,
      noPriceQty: 0,
    };
    cur.qty += c.qty;
    if (price != null) cur.value += c.qty * price;
    else cur.noPriceQty += c.qty;
    acc.set(key, cur);
  }
  return [...acc.values()].sort((a, b) => b.value - a.value || b.qty - a.qty);
}
