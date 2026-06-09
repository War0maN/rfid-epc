-- ============================================================
-- RFID EPC Generator — анхны өгөгдөл (seed)
-- Эхний tenant + нэвтэрсэн хэрэглэгчийг холбоно.
-- Аппад signup UI байхгүй тул эхний удаа ЭНЭ ФАЙЛЫГ ажиллуулна.
-- ============================================================
--
-- АЛХАМ 1. Supabase Dashboard → Authentication → Users → "Add user"
--          дээр имэйл/нууц үгээр хэрэглэгчээ үүсгэ (эсвэл өөрөө бүртгүүл).
--
-- АЛХАМ 2. Доорх 4 утгыг өөрийнхөөрөө соль (имэйл, компанийн нэр,
--          GS1 company prefix, default filter), дараа нь Supabase
--          SQL Editor дотор бүхэлд нь ажиллуул.
--
-- ⚠️ gs1_company_prefix нь 6-12 оронтой, тэргүүлэх тэг хадгалагдсан
--    текст байх ёстой (жишээ '8600001' = 7 орон).
-- ============================================================

do $$
declare
  -- ↓↓↓ ӨӨРИЙНХ ИЙГ БИЧНЭ ↓↓↓
  v_email   text := 'you@company.com';
  v_company text := 'Миний компани';
  v_prefix  text := '8600001';
  v_filter  smallint := 1;
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
  insert into tenants (name, gs1_company_prefix, default_filter_value)
  values (v_company, v_prefix, v_filter)
  returning id into v_tenant;

  -- Хэрэглэгчийг tenant-тай холбож, admin эрх өгөх
  insert into profiles (id, tenant_id, email, role)
  values (v_user, v_tenant, v_email, 'admin');

  raise notice 'Бэлэн: tenant % үүсгэж, % -г admin болгон холболоо.', v_tenant, v_email;
end $$;
