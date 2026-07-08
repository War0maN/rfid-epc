// ============================================================
// Салбар (branch/location) — EPC ширхэг бүр аль салбарт байгааг заана.
//   RLS-ийн ачаар зөвхөн өөрийн тенант.
// ============================================================
import { supabase } from "./supabaseClient";
import i18n from "../i18n";

/** Давхцсан код (23505) бол найрсаг мессеж, эс бөгөөс эх алдааг буцаана. */
function branchError(error: { code?: string } | null): Error | null {
  if (!error) return null;
  if (error.code === "23505") {
    return new Error(i18n.t("errors.branchCodeDuplicate"));
  }
  return error as unknown as Error;
}

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
  const friendly = branchError(error);
  if (friendly) throw friendly;
  return data as Branch;
}

export async function updateBranch(id: string, name: string, code: string | null): Promise<void> {
  const { error } = await supabase
    .from("branches")
    .update({ name: name.trim(), code: code?.trim() || null })
    .eq("id", id);
  const friendly = branchError(error);
  if (friendly) throw friendly;
}

export async function deleteBranch(id: string): Promise<void> {
  const { error } = await supabase.from("branches").delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation — энэ салбарт EPC бүртгэлтэй байна.
    if ((error as { code?: string }).code === "23503") {
      throw new Error(i18n.t("errors.branchHasEpc"));
    }
    throw error;
  }
}
