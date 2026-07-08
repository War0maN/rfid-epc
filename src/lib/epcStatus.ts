// ============================================================
// EPC төлөв (status lifecycle) — нэг эх сурвалж: код ↔ нэр ↔ badge өнгө.
//   Хэвлээгүй → Идэвхтэй → Борлуулсан / Шилжүүлж буй / Бусад.
//   EpcTable (харах/шүүх/export), EpcLookup бүгд эндээс авна.
//   Нэрс i18n-ээс (labelMap — уншилт бүрд идэвхтэй хэлээр).
// ============================================================
import { labelMap } from "../i18n/labelMap";

export type EpcStatus = "unprinted" | "active" | "sold" | "transferring" | "other";

/** Dropdown/жагсаалтын дараалал (lifecycle урсгалаар). */
export const EPC_STATUSES: EpcStatus[] = ["unprinted", "active", "sold", "transferring", "other"];

export const STATUS_LABEL: Record<EpcStatus, string> = labelMap({
  unprinted: "epcStatus.unprinted",
  active: "epcStatus.active",
  sold: "epcStatus.sold",
  transferring: "epcStatus.transferring",
  other: "epcStatus.other",
});

/** Badge-ийн Tailwind классууд (фон + текст). */
export const STATUS_BADGE: Record<EpcStatus, string> = {
  unprinted: "bg-slate-100 text-slate-500",
  active: "bg-emerald-50 text-emerald-700",
  sold: "bg-blue-50 text-blue-700",
  transferring: "bg-amber-50 text-amber-700",
  other: "bg-rose-50 text-rose-700",
};

/** Код → Монгол нэр (танихгүй утгыг өөрийг нь буцаана). */
export function labelOf(s: string): string {
  return STATUS_LABEL[s as EpcStatus] ?? s;
}

/** Код → badge класс (танихгүй утгыг саарал болгоно). */
export function badgeOf(s: string): string {
  return STATUS_BADGE[s as EpcStatus] ?? STATUS_BADGE.unprinted;
}
