// ============================================================
// Эрхийн систем (Phase 2c) — нэг эх сурвалж: түлхүүр ↔ нэр ↔ бүлэг.
//   UI давхарга: таб/товч нуух (App, компонентууд). DB давхарга:
//   RLS policy + RPC доторх has_perm() — тойрч гарах боломжгүй.
//   Тохиргоогүй хэрэглэгч = бүрэн эрх (default); админ үргэлж бүрэн.
//   title/label = ОРЧУУЛГЫН ТҮЛХҮҮР — render дээр t(...)-ээр тайлна.
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
    title: "permissions.groupTabs",
    perms: [
      { key: "tab_create", label: "permissions.tab_create" },
      { key: "tab_products", label: "permissions.tab_products" },
      { key: "tab_inventory", label: "permissions.tab_inventory" },
      { key: "tab_transactions", label: "permissions.tab_transactions" },
      { key: "tab_reports", label: "permissions.tab_reports" },
      { key: "tab_epc", label: "permissions.tab_epc" },
      { key: "tab_labels", label: "permissions.tab_labels" },
      { key: "tab_branches", label: "permissions.tab_branches" },
      { key: "tab_audit", label: "permissions.tab_audit" },
    ],
  },
  {
    title: "permissions.groupActions",
    perms: [
      { key: "act_import", label: "permissions.act_import" },
      { key: "act_print", label: "permissions.act_print" },
      { key: "act_sale", label: "permissions.act_sale" },
      { key: "act_transfer", label: "permissions.act_transfer" },
      { key: "act_receive", label: "permissions.act_receive" },
      { key: "act_return", label: "permissions.act_return" },
      { key: "act_other", label: "permissions.act_other" },
      { key: "act_product_edit", label: "permissions.act_product_edit" },
      { key: "act_catalog_edit", label: "permissions.act_catalog_edit" },
      { key: "act_branch_edit", label: "permissions.act_branch_edit" },
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
