// ============================================================
// Эрхийн систем (Phase 2c) — нэг эх сурвалж: түлхүүр ↔ Монгол нэр ↔ бүлэг.
//   UI давхарга: таб/товч нуух (App, компонентууд). DB давхарга:
//   RLS policy + RPC доторх has_perm() — тойрч гарах боломжгүй.
//   Тохиргоогүй хэрэглэгч = бүрэн эрх (default); админ үргэлж бүрэн.
// ============================================================

export type Perm =
  // Цэс харах
  | "tab_create"
  | "tab_products"
  | "tab_inventory"
  | "tab_transactions"
  | "tab_reports"
  | "tab_epc"
  | "tab_labels"
  | "tab_branches"
  | "tab_audit"
  // Үйлдэл (DB талд давхар шалгагдана)
  | "act_import"
  | "act_print"
  | "act_sale"
  | "act_transfer"
  | "act_other"
  | "act_return"
  | "act_receive"
  | "act_product_edit"
  | "act_catalog_edit"
  | "act_branch_edit";

export const PERM_GROUPS: { title: string; perms: { key: Perm; label: string }[] }[] = [
  {
    title: "Цэс харах",
    perms: [
      { key: "tab_create", label: "Шинэ ажил" },
      { key: "tab_products", label: "Бүтээгдэхүүн" },
      { key: "tab_inventory", label: "Үлдэгдэл" },
      { key: "tab_transactions", label: "Гүйлгээ" },
      { key: "tab_reports", label: "Тайлан" },
      { key: "tab_epc", label: "Бараа (EPC)" },
      { key: "tab_labels", label: "Шошго" },
      { key: "tab_branches", label: "Салбар" },
      { key: "tab_audit", label: "Аудит" },
    ],
  },
  {
    title: "Үйлдэл",
    perms: [
      { key: "act_import", label: "Импорт / EPC үүсгэх" },
      { key: "act_print", label: "Шошго хэвлэх" },
      { key: "act_sale", label: "Борлуулалт хийх" },
      { key: "act_transfer", label: "Шилжүүлэг илгээх" },
      { key: "act_receive", label: "Шилжүүлэг хүлээн авах/цуцлах" },
      { key: "act_return", label: "Буцаалт хийх" },
      { key: "act_other", label: "Бусад гүйлгээ хийх" },
      { key: "act_product_edit", label: "Бараа нэмэх/засах" },
      { key: "act_catalog_edit", label: "Ангилал/шинж чанар засах" },
      { key: "act_branch_edit", label: "Салбар нэмэх/засах" },
    ],
  },
];

/** Бүх эрхийн түлхүүр (модалын "бүгд чеклэгдсэн" default-д). */
export const ALL_PERMS: Perm[] = PERM_GROUPS.flatMap((g) => g.perms.map((p) => p.key));

/** Таб id ↔ эрхийн түлхүүр (App-ийн таб шүүлтэд). Жагсаалтад байхгүй таб нээлттэй. */
export const TAB_PERM: Record<string, Perm> = {
  create: "tab_create",
  products: "tab_products",
  inventory: "tab_inventory",
  transactions: "tab_transactions",
  reports: "tab_reports",
  table: "tab_epc",
  labels: "tab_labels",
  branches: "tab_branches",
  audit: "tab_audit",
};

/**
 * Эрх шалгагч үүсгэнэ. perms = null (админ/тохиргоогүй) → бүгд зөвшөөрөгдөнө.
 * UI-ийн ая тух л — жинхэнэ хамгаалалт DB талд (has_perm).
 */
export function makeCan(perms: string[] | null): (p: Perm) => boolean {
  if (!perms) return () => true;
  const set = new Set(perms);
  return (p) => set.has(p);
}
