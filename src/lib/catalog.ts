// ============================================================
// Каталог: динамик ангилал (мод) + шинж чанарын тодорхойлолт CRUD.
//   categories      — өөрийгөө заадаг мод (parent_id-ээр хэдэн ч түвшин).
//   attribute_defs  — тенант бүр өөрийн шинж чанарыг тодорхойлно.
//   RLS-ийн ачаар бүгд зөвхөн өөрийн тенантад хязгаарлагдана.
// ============================================================
import { supabase } from "./supabaseClient";

export interface Category {
  id: string;
  parent_id: string | null;
  name: string;
  sort: number;
}

export type AttrInputType = "text" | "number" | "select";

export interface AttributeDef {
  id: string;
  category_id: string | null; // null = бүх ангилалд хамаарна
  label: string;
  input_type: AttrInputType;
  options: string[]; // select үед сонголтууд
  required: boolean;
  sort: number;
}

/** Мод дүрслэхэд: ангилал + түүний хүүхдүүд (рекурсив). */
export interface CategoryNode extends Category {
  children: CategoryNode[];
}

// ---------- Categories ----------

export async function listCategories(): Promise<Category[]> {
  const { data, error } = await supabase
    .from("categories")
    .select("id, parent_id, name, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Category[];
}

/** Хавтгай жагсаалтыг мод болгоно (parent_id-ээр). */
export function buildTree(rows: Category[]): CategoryNode[] {
  const byId = new Map<string, CategoryNode>();
  for (const r of rows) byId.set(r.id, { ...r, children: [] });
  const roots: CategoryNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_id && byId.has(node.parent_id)) byId.get(node.parent_id)!.children.push(node);
    else roots.push(node);
  }
  return roots;
}

export async function createCategory(name: string, parentId: string | null): Promise<Category> {
  const { data, error } = await supabase
    .from("categories")
    .insert({ name: name.trim(), parent_id: parentId })
    .select("id, parent_id, name, sort")
    .single();
  if (error) throw error;
  return data as Category;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("categories").update({ name: name.trim() }).eq("id", id);
  if (error) throw error;
}

/** Ангилал устгана (хүүхдүүд нь cascade-аар хамт устана). */
export async function deleteCategory(id: string): Promise<void> {
  const { error } = await supabase.from("categories").delete().eq("id", id);
  if (error) throw error;
}

// ---------- Attribute definitions ----------

interface AttrRow {
  id: string;
  category_id: string | null;
  label: string;
  input_type: AttrInputType;
  options: string[] | null;
  required: boolean;
  sort: number;
}

function toAttr(r: AttrRow): AttributeDef {
  return { ...r, options: r.options ?? [] };
}

export async function listAttributeDefs(): Promise<AttributeDef[]> {
  const { data, error } = await supabase
    .from("attribute_defs")
    .select("id, category_id, label, input_type, options, required, sort")
    .order("sort", { ascending: true })
    .order("label", { ascending: true });
  if (error) throw error;
  return ((data ?? []) as AttrRow[]).map(toAttr);
}

export interface AttributeDefInput {
  category_id: string | null;
  label: string;
  input_type: AttrInputType;
  options: string[];
  required: boolean;
}

export async function createAttributeDef(input: AttributeDefInput): Promise<AttributeDef> {
  const { data, error } = await supabase
    .from("attribute_defs")
    .insert({
      category_id: input.category_id,
      label: input.label.trim(),
      input_type: input.input_type,
      options: input.input_type === "select" ? input.options : [],
      required: input.required,
    })
    .select("id, category_id, label, input_type, options, required, sort")
    .single();
  if (error) throw error;
  return toAttr(data as AttrRow);
}

export async function updateAttributeDef(
  id: string,
  patch: Partial<AttributeDefInput>
): Promise<void> {
  const upd: Record<string, unknown> = {};
  if (patch.label !== undefined) upd.label = patch.label.trim();
  if (patch.input_type !== undefined) upd.input_type = patch.input_type;
  if (patch.options !== undefined) upd.options = patch.options;
  if (patch.required !== undefined) upd.required = patch.required;
  if (patch.category_id !== undefined) upd.category_id = patch.category_id;
  const { error } = await supabase.from("attribute_defs").update(upd).eq("id", id);
  if (error) throw error;
}

export async function deleteAttributeDef(id: string): Promise<void> {
  const { error } = await supabase.from("attribute_defs").delete().eq("id", id);
  if (error) throw error;
}

/**
 * Excel импортод: ангиллын замуудыг (path) шийдэж, байхгүй түвшнийг үүсгэнэ.
 * Замыг "/", ">", "|"-ийн аль нэгээр салгана. Буцаалт: эх path → leaf id.
 * Цөөн ангиллд зориулсан (түвшин бүрд нэг insert) — мянган бараанд ч цөөн зам.
 */
export async function ensureCategoriesByPaths(paths: string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const unique = [...new Set(paths.map((p) => p.trim()).filter(Boolean))];
  if (unique.length === 0) return result;

  const existing = await listCategories();
  const key = (parentId: string | null, name: string) => `${parentId ?? ""}|${name.toLowerCase()}`;
  const byKey = new Map<string, string>();
  for (const c of existing) byKey.set(key(c.parent_id, c.name.trim()), c.id);

  for (const path of unique) {
    const levels = path.split(/[/>|]/).map((s) => s.trim()).filter(Boolean);
    let parentId: string | null = null;
    for (const levelName of levels) {
      const k = key(parentId, levelName);
      let id = byKey.get(k);
      if (!id) {
        id = (await createCategory(levelName, parentId)).id;
        byKey.set(k, id);
      }
      parentId = id;
    }
    if (parentId) result.set(path, parentId);
  }
  return result;
}

/** Ангиллын мод → dropdown сонголтууд (бүтэн зам: "A / B / C"). */
export function categoryOptions(rows: Category[]): { id: string; label: string }[] {
  const tree = buildTree(rows);
  const out: { id: string; label: string }[] = [];
  const walk = (nodes: CategoryNode[], prefix: string) => {
    for (const n of nodes) {
      const label = prefix ? `${prefix} / ${n.name}` : n.name;
      out.push({ id: n.id, label });
      walk(n.children, label);
    }
  };
  walk(tree, "");
  return out;
}

/**
 * Тухайн ангилалд хамаарах шинж чанарууд: глобал (category_id=null) + энэ
 * ангиллынх + эцэг ангиллуудынх (удамшина). Бараа үүсгэх форм энэ жагсаалтыг
 * ашиглана.
 */
export function attrsForCategory(
  defs: AttributeDef[],
  categoryId: string | null,
  cats: Category[]
): AttributeDef[] {
  const ids = new Set<string | null>([null]); // глобал
  let cur: string | null = categoryId;
  const byId = new Map(cats.map((c) => [c.id, c]));
  while (cur) {
    ids.add(cur);
    cur = byId.get(cur)?.parent_id ?? null;
  }
  const applicable = defs.filter((d) => ids.has(d.category_id)).sort((a, b) => a.sort - b.sort);
  // Нэг label давхар (глобал + ангилал) бол ангиллынхыг үлдээж давхардлыг арилгана.
  const byLabel = new Map<string, AttributeDef>();
  for (const d of applicable) {
    const k = d.label.trim().toLowerCase();
    const ex = byLabel.get(k);
    if (!ex || (ex.category_id === null && d.category_id !== null)) byLabel.set(k, d);
  }
  return [...byLabel.values()].sort((a, b) => a.sort - b.sort);
}

/**
 * Өгсөн шинж чанарын нэрсийг глобал attribute_defs-д автоматаар бүртгэнэ
 * (байхгүйг нь л, text төрлөөр). Импорт/бараа үүсгэх үед дуудна — компанийн
 * шинж чанарууд дата-наас динамикаар бүртгэгдэнэ.
 */
export async function ensureAttributeDefs(labels: string[]): Promise<void> {
  const unique = [...new Set(labels.map((l) => l.trim()).filter(Boolean))];
  if (unique.length === 0) return;
  const existing = await listAttributeDefs();
  const have = new Set(existing.map((d) => d.label.trim().toLowerCase()));
  for (const label of unique) {
    if (have.has(label.toLowerCase())) continue;
    await createAttributeDef({
      category_id: null,
      label,
      input_type: "text",
      options: [],
      required: false,
    });
    have.add(label.toLowerCase());
  }
}
