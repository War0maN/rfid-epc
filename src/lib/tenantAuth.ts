// ============================================================
// Multi-tenant signup / login туслахууд.
//   * listTenants()           — нэвтрэх дэлгэцийн tenant dropdown.
//   * loginWithTenant()       — тенант + (username|имэйл) + нууц үг.
//   * signUpAndCreateTenant() — шинэ хэрэглэгч + өөрийн тенант (admin).
//   * fetchMyProfile()        — нэвтэрсэн хэрэглэгчийн профайл (онбординг шалгахад).
// ============================================================
import { supabase } from "./supabaseClient";

export interface TenantOption {
  id: string;
  name: string;
}

export interface MyProfile {
  id: string;
  tenant_id: string;
  email: string | null;
  username: string | null;
  role: "admin" | "operator";
}

/** Нэвтрэхээс өмнө тенантуудыг (id+name) татна. */
export async function listTenants(): Promise<TenantOption[]> {
  const { data, error } = await supabase.rpc("public_tenants");
  if (error) throw error;
  return (data ?? []) as TenantOption[];
}

/**
 * Тенант + нэвтрэх нэр/имэйл + нууц үгээр нэвтэрнэ.
 * Оролт "@"-тэй бол имэйл гэж үзнэ; үгүй бол тенант доторх username-аас
 * имэйлийг resolve хийнэ.
 */
export async function loginWithTenant(params: {
  tenantId?: string;
  identifier: string; // username эсвэл имэйл
  password: string;
}): Promise<void> {
  const id = params.identifier.trim();
  let email = id;

  // Имэйл биш (нэвтрэх нэр) бол тенант доторх username-аас имэйлийг resolve хийнэ.
  // Имэйл оруулсан бол тенант сонгох шаардлагагүй (имэйл өөрөө хэрэглэгчийг тодорхойлно).
  if (!id.includes("@")) {
    if (!params.tenantId) {
      throw new Error("Нэвтрэх нэрээр орохын тулд тенантаа сонгоно уу (эсвэл имэйлээ оруулна уу).");
    }
    const { data, error } = await supabase.rpc("resolve_login_email", {
      p_tenant: params.tenantId,
      p_username: id,
    });
    if (error) throw error;
    if (!data) throw new Error("Энэ тенантад тийм нэвтрэх нэр олдсонгүй.");
    email = data as string;
  }

  const { error } = await supabase.auth.signInWithPassword({ email, password: params.password });
  if (error) throw error;
}

/**
 * Шинэ хэрэглэгч бүртгэж, өөрийн тенантыг үүсгэнэ (admin).
 * Имэйл баталгаажуулалт ИДЭВХГҮЙ үед signUp шууд session буцаадаг тул
 * тенантыг тэр дороо үүсгэнэ. Идэвхтэй бол хэрэглэгч имэйлээ баталгаажуулж,
 * дараа нь онбординг дэлгэцээр тенантаа үүсгэнэ.
 */
export async function signUpAndCreateTenant(params: {
  email: string;
  password: string;
  username: string;
  tenantName: string;
  gs1Prefix: string;
  filter?: number;
}): Promise<{ needsEmailConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({
    email: params.email.trim(),
    password: params.password,
  });
  if (error) throw error;

  // Session байхгүй бол имэйл баталгаажуулалт хэрэгтэй → тенантыг дараа үүсгэнэ.
  if (!data.session) return { needsEmailConfirm: true };

  await createTenantAndAdmin(params);
  return { needsEmailConfirm: false };
}

/** Нэвтэрсэн хэрэглэгчид шинэ тенант + admin профайл үүсгэх (онбординг). */
export async function createTenantAndAdmin(params: {
  username: string;
  tenantName: string;
  gs1Prefix: string;
  filter?: number;
}): Promise<void> {
  const { error } = await supabase.rpc("create_tenant_and_admin", {
    p_name: params.tenantName.trim(),
    p_prefix: params.gs1Prefix.replace(/\D/g, ""),
    p_filter: params.filter ?? 1,
    p_username: params.username.trim(),
  });
  if (error) throw error;
}

/** Нэвтэрсэн хэрэглэгчийн профайл. Байхгүй (онбординг хэрэгтэй) бол null. */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, username, role")
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile) ?? null;
}
