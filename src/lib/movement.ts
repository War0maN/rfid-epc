// ============================================================
// Тайлан — Бараа материалын хөдөлгөөн (Inventory Movement, олон улсын
// стандарт): Эхний үлдэгдэл + Орлого − Зарлага = Эцсийн үлдэгдэл.
// report_movement RPC бараагаар тоог өгнө; үнэлгээ (өртөг + зарах үнэ,
// одоогийн үнээр) болон ангиллын бүлэглэлт client талд.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";
import type { ProductRow } from "./products";

export interface MovementRow {
  product_id: string;
  opening: number;
  in_new: number; // шинэ орлого (EPC үүссэн)
  in_return: number; // буцаалт (sold/other → нөөцөд)
  out_sold: number; // борлуулалт
  out_writeoff: number; // актлалт (→ Бусад гүйлгээ)
  closing: number;
}

/** Интервалын хөдөлгөөн (бараагаар). from/to = 'YYYY-MM-DD'. */
export async function fetchMovementReport(from: string, to: string): Promise<MovementRow[]> {
  const { data, error } = await supabase.rpc("report_movement", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as MovementRow[]).map((r) => ({
    ...r,
    opening: Number(r.opening),
    in_new: Number(r.in_new),
    in_return: Number(r.in_return),
    out_sold: Number(r.out_sold),
    out_writeoff: Number(r.out_writeoff),
    closing: Number(r.closing),
  }));
}

export type MovementGroup = "product" | "category";

export const MV_GROUP_LABEL: Record<MovementGroup, string> = labelMap({
  product: "reports.groupProduct",
  category: "reports.groupCategory",
});

/** Нэг бүлгийн тоо + үнэлгээ (өртгөөр ба зарах үнээр, одоогийн үнэ). */
export interface GroupedMovement {
  key: string;
  label: string;
  sub: string | null; // бараагаар үед SKU
  opening: number;
  inQty: number; // in_new + in_return
  outQty: number; // out_sold + out_writeoff
  closing: number;
  openingCost: number;
  openingRetail: number;
  inCost: number;
  inRetail: number;
  outCost: number;
  outRetail: number;
  closingCost: number;
  closingRetail: number;
  noCostQty: number; // өртөггүй барааны эцсийн ширхэг (өртгийн дүнд ороогүй)
  noPriceQty: number; // зарах үнэгүй барааны эцсийн ширхэг
}

export function groupMovement(
  rows: MovementRow[],
  group: MovementGroup,
  products: Map<string, ProductRow>
): GroupedMovement[] {
  const acc = new Map<string, GroupedMovement>();
  for (const r of rows) {
    const p = products.get(r.product_id);
    const cost = p?.cost ?? null;
    const price = p?.price ?? null;
    let key: string;
    let label: string;
    let sub: string | null = null;
    if (group === "category") {
      key = p?.category_l1 ?? "__none__";
      label = p?.category_l1 ?? i18n.t("reports.noCategory");
    } else {
      key = r.product_id;
      label = p?.name || p?.sku || i18n.t("reports.unnamedProduct");
      sub = p?.sku ?? null;
    }
    const cur =
      acc.get(key) ??
      ({
        key, label, sub,
        opening: 0, inQty: 0, outQty: 0, closing: 0,
        openingCost: 0, openingRetail: 0, inCost: 0, inRetail: 0,
        outCost: 0, outRetail: 0, closingCost: 0, closingRetail: 0,
        noCostQty: 0, noPriceQty: 0,
      } as GroupedMovement);
    const inQty = r.in_new + r.in_return;
    const outQty = r.out_sold + r.out_writeoff;
    cur.opening += r.opening;
    cur.inQty += inQty;
    cur.outQty += outQty;
    cur.closing += r.closing;
    if (cost != null) {
      cur.openingCost += r.opening * cost;
      cur.inCost += inQty * cost;
      cur.outCost += outQty * cost;
      cur.closingCost += r.closing * cost;
    } else {
      cur.noCostQty += r.closing;
    }
    if (price != null) {
      cur.openingRetail += r.opening * price;
      cur.inRetail += inQty * price;
      cur.outRetail += outQty * price;
      cur.closingRetail += r.closing * price;
    } else {
      cur.noPriceQty += r.closing;
    }
    acc.set(key, cur);
  }
  return [...acc.values()].sort(
    (a, b) => b.closingCost - a.closingCost || b.closing - a.closing || a.label.localeCompare(b.label)
  );
}
