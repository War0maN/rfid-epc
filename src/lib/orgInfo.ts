// ============================================================
// Байгууллагын мэдээлэл (tenants мөр) — падаан/баримтын толгойд гардаг
// нэр, хаяг, утас, имэйл. Засах эрх зөвхөн админд (RLS policy).
// ============================================================
import { supabase } from "./supabaseClient";

export interface OrgInfo {
  id: string;
  name: string;
  address: string | null;
  phone: string | null;
  email: string | null;
}

export async function fetchOrgInfo(): Promise<OrgInfo> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name, address, phone, email")
    .single();
  if (error) throw error;
  return data as OrgInfo;
}

export async function updateOrgInfo(
  id: string,
  fields: { name: string; address: string | null; phone: string | null; email: string | null }
): Promise<void> {
  const { error } = await supabase
    .from("tenants")
    .update({
      name: fields.name.trim(),
      address: fields.address?.trim() || null,
      phone: fields.phone?.trim() || null,
      email: fields.email?.trim() || null,
    })
    .eq("id", id);
  if (error) throw error;
}
