// ============================================================
// Платформын хяналт — тенант хоорондын нэгтгэл (зөвхөн платформын админд).
// Систем бүхэлдээ RLS-ээр тенантаар хаалттай тул энд бүх дуудлага
// platform_* security definer RPC-ээр явна; эрхийн шалгалт DB талд.
// Клиентэд service_role түлхүүр ХЭЗЭЭ Ч ашиглахгүй.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";
import { labelMap } from "../i18n/labelMap";

/** Нэг харилцагч компанийн хураангуй (platform_overview RPC-ийн нэг мөр). */
export interface PlatformTenant {
  tenant_id: string;
  tenant_name: string;
  created_at: string;
  users: number;
  branches: number;
  products: number;
  epc_total: number;
  epc_printed: number;
  labels_printed: number; // sum(print_count) = физик зарцуулагдсан шошго
  epc_active: number;
  epc_sold: number;
  tx_count: number;
  last_activity: string | null;
  last_sign_in: string | null;
}

/** Нэвтэрсэн хэрэглэгч платформын админ эсэх (таб харуулах эсэхийг шийднэ). */
export async function isPlatformAdmin(): Promise<boolean> {
  const { data, error } = await supabase.rpc("is_platform_admin");
  if (error) return false; // функц байхгүй / эрхгүй — таб нуугдана
  return data === true;
}

const num = (v: unknown) => Number(v ?? 0);

/** Бүх тенантын нэгтгэл (компанийн тоо цөөн тул хуудаслалтгүй). */
export async function fetchPlatformOverview(): Promise<PlatformTenant[]> {
  const { data, error } = await supabase.rpc("platform_overview");
  if (error) throw error;
  return ((data ?? []) as PlatformTenant[]).map((r) => ({
    ...r,
    users: num(r.users),
    branches: num(r.branches),
    products: num(r.products),
    epc_total: num(r.epc_total),
    epc_printed: num(r.epc_printed),
    labels_printed: num(r.labels_printed),
    epc_active: num(r.epc_active),
    epc_sold: num(r.epc_sold),
    tx_count: num(r.tx_count),
  }));
}

/** Шошгоны хэрэглээ өдрөөр (анхны хэвлэлт / дахин хэвлэлт тусад нь). */
export interface LabelSeriesRow {
  tenant_id: string;
  day: string; // 'YYYY-MM-DD'
  first_prints: number;
  reprints: number;
}

export async function fetchLabelSeries(from: string, to: string): Promise<LabelSeriesRow[]> {
  const { data, error } = await supabase.rpc("platform_label_series", { p_from: from, p_to: to });
  if (error) throw error;
  return ((data ?? []) as LabelSeriesRow[]).map((r) => ({
    ...r,
    // day дутуу/null ирвэл ч мөрийг хаяхгүй — бүлэглэлтэд "(Огноогүй)" болно
    // (өмнө нь энд .slice дуудаад бүтэн апп цагаан дэлгэц болдог байсан).
    day: typeof r.day === "string" ? r.day : "",
    first_prints: num(r.first_prints),
    reprints: num(r.reprints),
  }));
}

export type LabelGroup = "month" | "day" | "tenant";

export const LABEL_GROUP_LABEL: Record<LabelGroup, string> = labelMap({
  month: "platform.groupMonth",
  day: "platform.groupDay",
  tenant: "platform.groupTenant",
});

export interface GroupedLabels {
  key: string;
  label: string;
  firstPrints: number;
  reprints: number;
  total: number;
}

/**
 * Өдрийн мөрүүдийг сонгосон түвшингээр нэгтгэнэ. tenantName = tenant_id → нэр
 * (overview-оос ирнэ; олдохгүй бол "?" — устгагдсан тенант гэх мэт).
 */
export function groupLabels(
  rows: LabelSeriesRow[],
  group: LabelGroup,
  tenantName: Map<string, string>
): GroupedLabels[] {
  const acc = new Map<string, GroupedLabels>();
  for (const r of rows) {
    const day = r.day || "";
    let key: string;
    let label: string;
    switch (group) {
      case "day":
        key = day || "__none__";
        label = day || i18n.t("platform.noDay");
        break;
      case "tenant":
        key = r.tenant_id;
        label = tenantName.get(r.tenant_id) ?? i18n.t("platform.unknownTenant");
        break;
      default:
        key = day ? day.slice(0, 7) : "__none__";
        label = day ? key : i18n.t("platform.noDay");
    }
    const cur = acc.get(key) ?? { key, label, firstPrints: 0, reprints: 0, total: 0 };
    cur.firstPrints += r.first_prints;
    cur.reprints += r.reprints;
    cur.total += r.first_prints + r.reprints;
    acc.set(key, cur);
  }
  const out = [...acc.values()];
  // Он цагийн бүлэглэлт — хугацааны дараалал; компаниар — хэрэглээгээр буурах.
  if (group === "tenant") out.sort((a, b) => b.total - a.total);
  else out.sort((a, b) => a.key.localeCompare(b.key));
  return out;
}
