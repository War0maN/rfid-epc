// ============================================================
// Салбар (branch/location) — EPC ширхэг бүр аль салбарт байгааг заана.
//   RLS-ийн ачаар зөвхөн өөрийн тенант.
// ============================================================
import { supabase } from "./supabaseClient";

export interface Branch {
  id: string;
  name: string;
  code: string | null;
  sort: number;
}

export async function listBranches(): Promise<Branch[]> {
  const { data, error } = await supabase
    .from("branches")
    .select("id, name, code, sort")
    .order("sort", { ascending: true })
    .order("name", { ascending: true });
  if (error) throw error;
  return (data ?? []) as Branch[];
}

/** Default (хамгийн эхний) салбар. EPC үүсгэхэд урьдчилан сонгоно. */
export async function defaultBranchId(): Promise<string | null> {
  const list = await listBranches();
  return list[0]?.id ?? null;
}

export async function createBranch(name: string, code: string | null): Promise<Branch> {
  const { data, error } = await supabase
    .from("branches")
    .insert({ name: name.trim(), code: code?.trim() || null })
    .select("id, name, code, sort")
    .single();
  if (error) throw error;
  return data as Branch;
}

export async function updateBranch(id: string, name: string, code: string | null): Promise<void> {
  const { error } = await supabase
    .from("branches")
    .update({ name: name.trim(), code: code?.trim() || null })
    .eq("id", id);
  if (error) throw error;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) throw error;
}
