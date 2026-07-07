// ============================================================
// Бүртгүүлэх / нэвтрэх (имэйл + нууц үг) ба тенантад урих (invite).
//   * loginWithEmail()        — имэйл + нууц үг.
//   * signUpAndCreateTenant() — шинэ хэрэглэгч + өөрийн тенант (admin).
//   * createTenantAndAdmin()  — нэвтэрсэн хэрэглэгчид тенант үүсгэх (онбординг).
//   * acceptInvite()          — урилга байвал тенантад нэгдэх.
//   * fetchMyProfile()        — нэвтэрсэн хэрэглэгчийн профайл.
//   * listMembers/listInvites/addInvite/cancelInvite — admin удирдлага.
// ============================================================
import { supabase } from "./supabaseClient";

export type Role = "admin" | "operator";

export interface MyProfile {
  id: string;
  tenant_id: string;
  email: string | null;
  role: Role;
}

export interface Member {
  id: string;
  email: string | null;
  role: Role;
  created_at: string;
  branch_ids: string[]; // хуваарилагдсан салбарууд (хоосон = бүгд/хязгааргүй)
}

export interface Invite {
  id: string;
  email: string;
  role: Role;
  created_at: string;
}

/** Имэйл + нууц үгээр нэвтрэх. */
export async function loginWithEmail(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) throw error;
}

/**
 * Зөвхөн auth акаунт үүсгэнэ (имэйл + нууц үг). Тенант энд үүсгэхгүй —
 * нэвтэрсний дараа урилга байвал тенантад нэгдэнэ, эс бөгөөс онбординг
 * дэлгэцээр өөрийн тенантаа үүсгэнэ.
 * Имэйл баталгаажуулалт идэвхтэй бол session буцахгүй (needsEmailConfirm).
 */
export async function signUpUser(
  email: string,
  password: string
): Promise<{ needsEmailConfirm: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) throw error;
  return { needsEmailConfirm: !data.session };
}

/** Нэвтэрсэн хэрэглэгчид шинэ тенант + admin профайл үүсгэх. */
export async function createTenantAndAdmin(params: { tenantName: string }): Promise<void> {
  const { error } = await supabase.rpc("create_tenant_and_admin", {
    p_name: params.tenantName.trim(),
  });
  if (error) throw error;
}

/**
 * Нэвтэрсэн хэрэглэгчийн имэйлд тохирох урилга байвал тенантад нэгдэнэ.
 * Тенант id буцаана (нэгдсэн эсвэл аль хэдийн гишүүн), эс олдвол null
 * (→ онбординг руу). Профайлгүй хэрэглэгчид нэвтэрсэн дараа дуудна.
 */
export async function acceptInvite(): Promise<string | null> {
  const { data, error } = await supabase.rpc("accept_invite");
  if (error) throw error;
  return (data as string | null) ?? null;
}

/** Нэвтэрсэн хэрэглэгчийн профайл. Байхгүй (онбординг/урилга хэрэгтэй) бол null. */
export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await supabase
    .from("profiles")
    .select("id, tenant_id, email, role")
    .eq("id", (await supabase.auth.getUser()).data.user?.id ?? "")
    .maybeSingle();
  if (error) throw error;
  return (data as MyProfile) ?? null;
}

// ---------- Admin: гишүүд ба урилга ----------

/** Тенантын бүх гишүүн + салбарын хуваарилалт (RLS-ээр зөвхөн өөрийн тенант). */
export async function listMembers(): Promise<Member[]> {
  const [{ data, error }, { data: ub, error: ubErr }] = await Promise.all([
    supabase.from("profiles").select("id, email, role, created_at").order("created_at", { ascending: true }),
    supabase.from("user_branches").select("user_id, branch_id"),
  ]);
  if (error) throw error;
  if (ubErr) throw ubErr;
  const byUser = new Map<string, string[]>();
  for (const r of (ub ?? []) as { user_id: string; branch_id: string }[]) {
    const list = byUser.get(r.user_id) ?? [];
    list.push(r.branch_id);
    byUser.set(r.user_id, list);
  }
  return ((data ?? []) as Omit<Member, "branch_ids">[]).map((m) => ({
    ...m,
    branch_ids: byUser.get(m.id) ?? [],
  }));
}

/** Гишүүний салбаруудыг тохируулна (админ; атом replace, хоосон = хязгааргүй). */
export async function setMemberBranches(userId: string, branchIds: string[]): Promise<void> {
  const { error } = await supabase.rpc("set_member_branches", {
    p_user: userId,
    p_branch_ids: branchIds,
  });
  if (error) throw error;
}

/** Өөрийн хуваарилагдсан салбарууд (хоосон = хязгааргүй). */
export async function fetchMyBranchIds(): Promise<string[]> {
  const uid = (await supabase.auth.getUser()).data.user?.id;
  if (!uid) return [];
  const { data, error } = await supabase
    .from("user_branches")
    .select("branch_id")
    .eq("user_id", uid);
  if (error) throw error;
  return ((data ?? []) as { branch_id: string }[]).map((r) => r.branch_id);
}

/** Хүлээгдэж буй урилгууд. */
export async function listInvites(): Promise<Invite[]> {
  const { data, error } = await supabase
    .from("invites")
    .select("id, email, role, created_at")
    .order("created_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Invite[];
}

/** Урилга нэмэх (admin). tenant_id-г DB default current_tenant_id()-аас авна. */
export async function addInvite(email: string, role: Role): Promise<void> {
  const { data: tenant, error: tErr } = await supabase.from("tenants").select("id").single();
  if (tErr) throw tErr;
  const { error } = await supabase.from("invites").insert({
    tenant_id: (tenant as { id: string }).id,
    email: email.trim().toLowerCase(),
    role,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  });
  if (error) throw error;
}

/** Урилга цуцлах. */
export async function cancelInvite(id: string): Promise<void> {
  const { error } = await supabase.from("invites").delete().eq("id", id);
  if (error) throw error;
}
