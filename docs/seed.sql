-- ============================================================
-- Chipmo Inventory — анхны өгөгдөл (seed)
-- Эхний tenant + нэвтэрсэн хэрэглэгчийг холбоно.
-- Аппад signup UI байхгүй тул эхний удаа ЭНЭ ФАЙЛЫГ ажиллуулна.
-- ============================================================
--
-- АЛХАМ 1. Supabase Dashboard → Authentication → Users → "Add user"
--          дээр имэйл/нууц үгээр хэрэглэгчээ үүсгэ (эсвэл өөрөө бүртгүүл).
--
-- АЛХАМ 2. Доорх 2 утгыг өөрийнхөөрөө соль (имэйл, компанийн нэр),
--          дараа нь Supabase SQL Editor дотор бүхэлд нь ажиллуул.
--
-- Тэмдэглэл: Аппад одоо Бүртгүүлэх/Онбординг UI бий тул энэ файл нь зөвхөн
--   гар аргаар тенант холбох сонголт. Жижиглэн дэлгүүр олон брэндийн бараа
--   авдаг тул дэлгүүрийн ӨӨРИЙН GS1 угтвар шаардлагагүй — EPC-г бараа бүрийн
--   GTIN (баркод)-оос үүсгэнэ.
-- ============================================================

do $$
declare
  -- ↓↓↓ ӨӨРИЙНХ ИЙГ БИЧНЭ ↓↓↓
  v_email   text := 'you@company.com';
  v_company text := 'Миний дэлгүүр';
  -- ↑↑↑ ─────────────────── ↑↑↑
  v_user   uuid;
  v_tenant uuid;
begin
  -- Хэрэглэгчийг имэйлээр олох
  select id into v_user from auth.users where email = v_email;
  if v_user is null then
    raise exception 'Имэйл "%" -тэй хэрэглэгч алга. Эхлээд Authentication → Add user.', v_email;
  end if;

  -- Профайл аль хэдийн байвал давхар tenant үүсгэхгүй
  if exists (select 1 from profiles where id = v_user) then
    raise notice 'Энэ хэрэглэгч аль хэдийн tenant-тай холбогдсон байна.';
    return;
  end if;

  -- Тенант үүсгэх
  insert into tenants (name, default_filter_value)
  values (v_company, 1)
  returning id into v_tenant;

  -- Хэрэглэгчийг tenant-тай холбож, admin эрх өгөх
  insert into profiles (id, tenant_id, email, role)
  values (v_user, v_tenant, v_email, 'admin');

  raise notice 'Бэлэн: tenant % үүсгэж, % -г admin болгон холболоо.', v_tenant, v_email;
end $$;
