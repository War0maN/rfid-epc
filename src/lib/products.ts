// ============================================================
// Бүтээгдэхүүн (master) жагсаалт — products_full view дээр.
//   Үлдэгдэл (epc_count) = тухайн барааны EPC-ийн тоо. (Phase 4-д салбар ×
//   төлөвөөр нарийсна.) RLS-ийн ачаар зөвхөн өөрийн тенант.
// ============================================================
import { supabase } from "./supabaseClient";

export interface ProductRow {
  id: string;
  name: string | null;
  sku: string | null;
  gtin: string | null;
  price: number | null;
  category_id: string | null;
  category_l1: string | null;
  category_l2: string | null;
  category_l3: string | null;
  attributes: Record<string, string>;
  epc_count: number; // нийт EPC (бүх төлөв) — устгалын хоригт
  active_count: number; // Идэвхтэй үлдэгдэл (Phase 4)
  created_at: string;
}

export async function listProducts(): Promise<ProductRow[]> {
  const { data, error } = await supabase
    .from("products_full")
    .select("*")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as ProductRow[];
}

/** Бараа устгах (зөвхөн админ — RLS-ээр хамгаалагдсан). EPC бүртгэлтэй бол хоригдоно. */
export async function deleteProduct(id: string): Promise<void> {
  const { error } = await supabase.from("products").delete().eq("id", id);
  if (error) {
    // 23503 = foreign_key_violation — энэ бараанд EPC бүртгэлтэй (түүхэн дата).
    if ((error as { code?: string }).code === "23503") {
      throw new Error(
        "Энэ бараанд EPC бүртгэлтэй тул устгах боломжгүй. " +
          "Эхлээд холбогдох Ажлыг устгаж EPC-г цэвэрлэнэ үү (үлдэгдэл 0 болсны дараа устгана)."
      );
    }
    throw error;
  }
}
