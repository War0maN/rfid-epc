-- ============================================================
-- RFID EPC Generator — Supabase / Postgres schema
-- Multi-tenant + RLS + atomic serial allocation
-- Supabase SQL Editor дотор бүхэлд нь ажиллуулна.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- tenants ----------
-- Жижиглэн дэлгүүр олон брэндийн бараа хүлээн авдаг тул дэлгүүрийн ӨӨРИЙН GS1
-- угтвар хэрэглэхгүй. EPC-г бараа тус бүрийн GTIN (баркод)-оос үүсгэнэ.
create table if not exists tenants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  default_filter_value  smallint not null default 1,
  created_at            timestamptz not null default now()
);

-- ---------- profiles (auth.users -> tenant) ----------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  tenant_id   uuid not null references tenants(id),
  email       text,
  role        text not null default 'operator' check (role in ('admin','operator')),
  created_at  timestamptz not null default now()
);

-- Нэвтэрсэн хэрэглэгчийн tenant_id-г буцаах туслах функц
create or replace function current_tenant_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select tenant_id from profiles where id = auth.uid()
$$;

-- ---------- products (барааны каталог) ----------
-- Бараа бүр өөрийн GTIN (EAN-13 баркод)-оор тодорхойлогдоно. EPC-г энэ GTIN-ээс
-- шууд (SGTIN-96) үүсгэнэ — аль брэндийнх нь хамаагүй.
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) default current_tenant_id(),
  gtin            text not null,         -- EAN-13/баркод (EPC үүсгэх эх)
  sku             text,                  -- нийлүүлэгчийн SKU/код
  name            text,
  source          text not null default 'packing_list' check (source in ('packing_list','in_app')),
  created_at      timestamptz not null default now()
);
-- gtin-ийн индекс/давхцал хязгаарлалтыг доорх migration хэсэг үүсгэнэ
-- (хуучин/шинэ DB хоёуланд нэг мөр ажиллана).

-- ---------- serial_counters (бараа бүрийн сүүлийн serial) ----------
create table if not exists serial_counters (
  tenant_id    uuid not null references tenants(id),
  product_id   uuid not null references products(id) on delete cascade,
  last_serial  bigint not null default 0,
  primary key (tenant_id, product_id)
);

-- ---------- jobs (нэг packing list = нэг Ажил) ----------
create table if not exists jobs (
  id            uuid primary key default gen_random_uuid(),
  tenant_id     uuid not null references tenants(id) default current_tenant_id(),
  job_number    text not null,
  arrival_date  date not null,           -- бараа ирсэн огноо (огноогоор шүүхэд)
  supplier      text,
  note          text,
  status        text not null default 'draft' check (status in ('draft','generated','printed')),
  created_at    timestamptz not null default now(),
  unique (tenant_id, job_number)
);

-- ---------- epc_codes (үүсгэсэн EPC бүрийн түүх) ----------
create table if not exists epc_codes (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) default current_tenant_id(),
  job_id      uuid not null references jobs(id) on delete cascade,
  product_id  uuid not null references products(id),
  box_no      text,                       -- хайрцагны дугаар (шошго наахад мөшгих)
  serial      bigint not null,
  epc_hex     char(24) not null,
  created_at  timestamptz not null default now(),
  unique (tenant_id, product_id, serial),   -- serial давхцал хамгаалалт
  unique (tenant_id, epc_hex)               -- EPC-ээр буцаах хайлт + давхцал
);
create index if not exists epc_job_idx  on epc_codes (tenant_id, job_id);
create index if not exists epc_date_idx on epc_codes (tenant_id, created_at);

-- ============================================================
-- Atomic serial allocation
-- Тухайн (tenant, product)-д p_count ширхэг serial "захиалж" авна.
-- Эхлэх serial-г буцаана: [start .. start + p_count - 1]
-- Зэрэгцээ дуудлагад давхцахгүй (UPDATE мөрийг түгжинэ).
-- ============================================================
create or replace function allocate_serials(
  p_tenant uuid, p_product uuid, p_count int
) returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare start_serial bigint;
begin
  if p_tenant <> current_tenant_id() then
    raise exception 'tenant mismatch';
  end if;
  if p_count < 1 then
    raise exception 'count must be >= 1';
  end if;

  insert into serial_counters (tenant_id, product_id, last_serial)
  values (p_tenant, p_product, 0)
  on conflict (tenant_id, product_id) do nothing;

  update serial_counters
     set last_serial = last_serial + p_count
   where tenant_id = p_tenant and product_id = p_product
  returning last_serial - p_count + 1 into start_serial;

  if start_serial + p_count - 1 > (2::bigint ^ 38) - 1 then
    raise exception 'serial range (2^38) exhausted for this product';
  end if;

  return start_serial;
end;
$$;

-- ============================================================
-- Bulk serial allocation — нэг Job-д олон бараанд зэрэг serial авна.
-- p_items: [{ "product_id": uuid, "count": int }, ...]
-- Буцаалт: { "<product_id>": <start_serial>, ... } (jsonb).
-- Нэг round-trip-ээр (импорт хурдан) бүх барааны serial-г атомаар захиална.
-- ============================================================
create or replace function allocate_serials_bulk(p_tenant uuid, p_items jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item   record;
  v_start  bigint;
  v_result jsonb := '{}'::jsonb;
begin
  if p_tenant <> current_tenant_id() then
    raise exception 'tenant mismatch';
  end if;

  for v_item in
    select * from jsonb_to_recordset(p_items) as x(product_id uuid, count int)
  loop
    if v_item.count is null or v_item.count < 1 then
      continue;
    end if;

    insert into serial_counters (tenant_id, product_id, last_serial)
    values (p_tenant, v_item.product_id, 0)
    on conflict (tenant_id, product_id) do nothing;

    update serial_counters
       set last_serial = last_serial + v_item.count
     where tenant_id = p_tenant and product_id = v_item.product_id
    returning last_serial - v_item.count + 1 into v_start;

    if v_start + v_item.count - 1 > (2::bigint ^ 38) - 1 then
      raise exception 'serial range (2^38) exhausted for product %', v_item.product_id;
    end if;

    v_result := v_result || jsonb_build_object(v_item.product_id::text, v_start);
  end loop;

  return v_result;
end;
$$;
grant execute on function allocate_serials_bulk(uuid, jsonb) to authenticated;

-- ============================================================
-- Row-Level Security
-- ============================================================
alter table tenants         enable row level security;
alter table profiles        enable row level security;
alter table products        enable row level security;
alter table serial_counters enable row level security;
alter table jobs            enable row level security;
alter table epc_codes       enable row level security;

-- (policy-уудыг drop-if-exists-ээр хамгаалж, файлыг дахин ажиллуулахад
--  алдаагүй байлгана.)

-- profiles: хэрэглэгч зөвхөн өөрийн профайлыг харна
drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles
  for select using (id = auth.uid());

-- tenants: гишүүн зөвхөн өөрийн тенантыг харна
drop policy if exists "own tenant" on tenants;
create policy "own tenant" on tenants
  for select using (id = current_tenant_id());

-- Тенантын мөрүүд: бүрэн хандалт зөвхөн өөрийн тенантад
drop policy if exists "tenant products" on products;
create policy "tenant products" on products
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

drop policy if exists "tenant serial_counters" on serial_counters;
create policy "tenant serial_counters" on serial_counters
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

drop policy if exists "tenant jobs" on jobs;
create policy "tenant jobs" on jobs
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

drop policy if exists "tenant epc_codes" on epc_codes;
create policy "tenant epc_codes" on epc_codes
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

-- ============================================================
-- Audit log — хэн, хэзээ, юу өөрчилснийг хадгална.
--   * jobs / products / tenants дээрх өөрчлөлтийг DB trigger автоматаар бичнэ.
--   * "EPC үүсгэсэн", "CSV/ZPL татсан" зэрэг бизнес үйлдлийг апп
--     log_audit_event() RPC-ээр бичнэ.
--   * Append-only: хэрэглэгч зөвхөн өөрийн тенантын логийг УНШИНА
--     (засах/устгах policy байхгүй). Бичилт нь зөвхөн security definer
--     trigger/функцээр явагдана (RLS-г тойрно).
-- ============================================================
create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id),
  actor_id    uuid references auth.users(id),  -- үйлдэл хийсэн хэрэглэгч
  action      text not null,    -- insert|update|delete|generate|export_csv|export_zpl
  entity      text not null,    -- job|product|tenant|epc
  entity_id   uuid,
  before      jsonb,            -- хуучин утга (update/delete)
  after       jsonb,            -- шинэ утга (insert/update)
  meta        jsonb,            -- нэмэлт (жишээ нь { "count": 120 })
  created_at  timestamptz not null default now()
);
create index if not exists audit_tenant_date_idx on audit_log (tenant_id, created_at desc);

alter table audit_log enable row level security;

-- Зөвхөн өөрийн тенантын логийг унших. Insert/update/delete policy ЗОРИУД алга.
drop policy if exists "tenant audit read" on audit_log;
create policy "tenant audit read" on audit_log
  for select using (tenant_id = current_tenant_id());

-- ---------- Generic audit trigger ----------
-- to_jsonb(row)-оор хүснэгт бүрд нийтлэг ажиллана. tenant_id баганагүй
-- (tenants) хүснэгтэд id-г tenant_id болгон авна.
create or replace function audit_trigger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) else null end;
  v_new jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) else null end;
  v_rec jsonb := coalesce(v_new, v_old);
  v_tenant uuid := coalesce((v_rec->>'tenant_id')::uuid, (v_rec->>'id')::uuid);
begin
  insert into audit_log (tenant_id, actor_id, action, entity, entity_id, before, after)
  values (v_tenant, auth.uid(), lower(tg_op), tg_argv[0], (v_rec->>'id')::uuid, v_old, v_new);
  return coalesce(new, old);
end;
$$;

drop trigger if exists audit_jobs on jobs;
create trigger audit_jobs
  after insert or update or delete on jobs
  for each row execute function audit_trigger('job');

drop trigger if exists audit_products on products;
create trigger audit_products
  after insert or update or delete on products
  for each row execute function audit_trigger('product');

-- Тенантын тохиргоо (prefix, filter) өөрчлөгдөхийг л хянана.
drop trigger if exists audit_tenants on tenants;
create trigger audit_tenants
  after update on tenants
  for each row execute function audit_trigger('tenant');

-- ---------- App-level бизнес үйлдэл ----------
-- actor_id, tenant_id-г сервер талд auth.uid()/current_tenant_id()-аар
-- тогтооно — клиент хуурамчаар оруулах боломжгүй.
create or replace function log_audit_event(
  p_action text, p_entity text, p_entity_id uuid, p_meta jsonb default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (tenant_id, actor_id, action, entity, entity_id, meta)
  values (current_tenant_id(), auth.uid(), p_action, p_entity, p_entity_id, p_meta);
end;
$$;

-- ============================================================
-- Бүртгүүлэх / нэвтрэх (имэйл + нууц үг) ба тенантад урих (invite)
--   * Нэвтрэлт нь имэйл+нууц үгээр (Supabase auth). Имэйл нь хэрэглэгчийг
--     дэлхийд давтагдашгүйгээр тодорхойлдог тул тенант сонгох шаардлагагүй.
--   * create_tenant_and_admin() — шинэ хэрэглэгч өөрийн тенант + admin.
--   * invites + accept_invite() — admin имэйлээр урих, уригдсан хэрэглэгч
--     бүртгүүлэхэд тенантад operator/admin болж нэгдэнэ.
-- ============================================================

-- Өмнөх tenant-сонголттой login-ы илүүдэл объектыг цэвэрлэх (re-run аюулгүй)
drop function if exists public_tenants();
drop function if exists resolve_login_email(uuid, text);
drop function if exists create_tenant_and_admin(text, text, smallint, text);
drop function if exists create_tenant_and_admin(text, text, smallint);

-- Тенантын гишүүн зэрэглэлийг шалгах туслах (RLS policy-д)
create or replace function is_tenant_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and tenant_id = current_tenant_id() and role = 'admin'
  )
$$;

-- profiles: гишүүн өөрийн тенантын БҮХ гишүүнийг харна (Хэрэглэгчид жагсаалт).
drop policy if exists "tenant members read" on profiles;
create policy "tenant members read" on profiles
  for select using (tenant_id = current_tenant_id());

-- ---------- Шинэ тенант + admin профайл үүсгэх ----------
-- Бүртгүүлж нэвтэрсэн (session-тэй) хэрэглэгч өөрийн байгууллагыг үүсгэнэ.
create or replace function create_tenant_and_admin(p_name text) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'нэвтрээгүй байна';
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    raise exception 'энэ хэрэглэгч аль хэдийн тенанттай';
  end if;
  if length(coalesce(trim(p_name), '')) = 0 then
    raise exception 'байгууллагын нэр хоосон байна';
  end if;

  insert into tenants (name, default_filter_value)
  values (trim(p_name), 1)
  returning id into v_tenant;

  insert into profiles (id, tenant_id, email, role)
  values (v_uid, v_tenant, (select email from auth.users where id = v_uid), 'admin');

  return v_tenant;
end;
$$;
grant execute on function create_tenant_and_admin(text) to authenticated;

-- ============================================================
-- Урилга (invite) — admin тенантад хэрэглэгч нэмэх
-- ============================================================
create table if not exists invites (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) on delete cascade,
  email       text not null,
  role        text not null default 'operator' check (role in ('admin','operator')),
  created_by  uuid references auth.users(id),
  created_at  timestamptz not null default now(),
  unique (tenant_id, email)
);
create index if not exists invites_email_idx on invites (lower(email));

alter table invites enable row level security;

-- Гишүүн өөрийн тенантын урилгуудыг харна; зөвхөн admin нэмж/устгана.
drop policy if exists "tenant invites read" on invites;
create policy "tenant invites read" on invites
  for select using (tenant_id = current_tenant_id());
drop policy if exists "tenant invites admin write" on invites;
create policy "tenant invites admin write" on invites
  for all using (tenant_id = current_tenant_id() and is_tenant_admin())
          with check (tenant_id = current_tenant_id() and is_tenant_admin());

-- ---------- Урилгыг хүлээн авах ----------
-- Нэвтэрсэн хэрэглэгчийн имэйлд тохирох урилга байвал профайл үүсгэж
-- тенантад нэгдүүлээд урилгыг устгана. Тенант id буцаана (эс олдвол null).
create or replace function accept_invite()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_email text;
  v_inv   invites%rowtype;
begin
  if v_uid is null then
    raise exception 'нэвтрээгүй байна';
  end if;
  if exists (select 1 from profiles where id = v_uid) then
    return current_tenant_id();  -- аль хэдийн тенанттай
  end if;

  select email into v_email from auth.users where id = v_uid;

  select * into v_inv from invites
   where lower(email) = lower(v_email)
   order by created_at
   limit 1;
  if not found then
    return null;  -- урилга алга → шинэ тенант үүсгэх (онбординг)
  end if;

  insert into profiles (id, tenant_id, email, role)
  values (v_uid, v_inv.tenant_id, v_email, v_inv.role);

  delete from invites where id = v_inv.id;
  return v_inv.tenant_id;
end;
$$;
grant execute on function accept_invite() to authenticated;

-- ============================================================
-- Migration: жижиглэн дэлгүүрийн (GTIN-төвтэй) загвар руу шилжүүлэх
--   Аль хэдийн үүссэн DB дээр дутуу багана/хязгаарлалтыг нэмнэ.
--   Шинэ DB дээр create table-ууд аль хэдийн агуулсан тул эдгээр нь
--   зүгээр л алгасагдана (бүгд "if not exists" / re-run аюулгүй).
-- ============================================================
-- tenants: дэлгүүрийн өөрийн GS1 угтвар хэрэггүй болсон
alter table tenants  drop column if exists gs1_company_prefix;

-- products: GTIN-төвтэй болгох; хуучин кодлолтын баганыг устгах
alter table products add  column if not exists gtin text;
alter table products add  column if not exists sku  text;
alter table products drop column if exists source_gtin;     -- индексээ дагаж устна
alter table products drop column if exists item_reference;  -- хуучин unique-ээ дагаж устна
alter table products drop column if exists indicator;
create index if not exists products_tenant_gtin_idx on products (tenant_id, gtin);
-- Бүрэн (partial биш) unique — Supabase upsert onConflict-д ашиглагдана.
-- (null gtin олон мөр байж болно; Postgres null-уудыг ялгаатай гэж үздэг.)
-- Хуучин partial индекс (where gtin is not null) үлдсэн бол эхлээд устгана —
-- эс бөгөөс "if not exists" нэр давхцлаас болж бүрэн индексийг алгасна.
drop index if exists products_tenant_gtin_uidx;
create unique index products_tenant_gtin_uidx
  on products (tenant_id, gtin);

-- epc_codes: хайрцагны дугаар
alter table epc_codes add column if not exists box_no text;
-- epc_codes: хэвлэсэн төлөв (хэвлэсэн огноо; null бол хэвлээгүй)
alter table epc_codes add column if not exists printed_at timestamptz;
create index if not exists epc_printed_idx on epc_codes (tenant_id, printed_at);

-- ============================================================
-- Phase 3: EPC төлөв (status lifecycle).
--   Хэвлээгүй → Идэвхтэй → Борлуулсан / Шилжүүлж буй / Бусад.
--   status нь lifecycle-ийн эх сурвалж; printed_at нь хэзээ хэвлэснийг тэмдэглэнэ.
--   Үлдэгдэл (Phase 4) = 'active' төлөвтэй EPC-ийн тоо.
-- ============================================================
alter table epc_codes add column if not exists status text not null default 'unprinted'
  check (status in ('unprinted','active','sold','transferring','other'));
create index if not exists epc_status_idx on epc_codes (tenant_id, status);

-- Backfill (idempotent): хэвлэгдсэн нь Идэвхтэй, бусад нь Хэвлээгүй.
update epc_codes set status = 'active' where printed_at is not null and status = 'unprinted';

-- Устгалын хориг: идэвхтэй/борлуулсан/шилжиж буй/бусад EPC бол түүхэн дата —
-- хэзээ ч устгаж болохгүй. Зөвхөн Хэвлээгүй EPC устгагдана (цэвэрлэгээ).
-- Энэ нь Job-cascade устгал болон шууд устгал бүрийг хамгаална.
create or replace function epc_block_active_delete() returns trigger as $$
begin
  if old.status <> 'unprinted' then
    raise exception 'EPC-г устгах боломжгүй: % төлөвтэй (зөвхөн Хэвлээгүй EPC устгана).', old.status
      using errcode = '23503';
  end if;
  return old;
end $$ language plpgsql;

drop trigger if exists epc_no_delete_active on epc_codes;
create trigger epc_no_delete_active
  before delete on epc_codes
  for each row execute function epc_block_active_delete();

-- ============================================================
-- Migration: GID-96 (GS1-гүй) дэмжлэг — баркодгүй бараа
--   Баркод/GTIN байхгүй барааг GID-96-аар кодлоно. Дугаарыг сервер тал
--   автоматаар (trigger) онооно — апп тал нэмж дуудах шаардлагагүй.
--     tenants.manager_number  — General Manager Number (28-бит)
--     products.object_class   — Object Class (24-бит)
--     products.ext_key        — баркодгүй барааны давтагдалгүй түлхүүр
--   Бүгд re-run аюулгүй.
-- ============================================================

-- ---- tenants.manager_number (28-бит, тенант тус бүрд давтагдалгүй) ----
create sequence if not exists tenant_manager_seq as bigint minvalue 1 start 1;
grant usage on sequence tenant_manager_seq to authenticated;
alter table tenants add column if not exists manager_number bigint;

create or replace function set_tenant_manager_number()
returns trigger language plpgsql as $$
begin
  if new.manager_number is null then
    new.manager_number := nextval('tenant_manager_seq');
  end if;
  return new;
end;
$$;
drop trigger if exists trg_tenant_manager_number on tenants;
create trigger trg_tenant_manager_number
  before insert on tenants
  for each row execute function set_tenant_manager_number();

-- Хуучин тенантуудад дугаар нөхөж олгоно.
update tenants set manager_number = nextval('tenant_manager_seq')
 where manager_number is null;

-- Constraint-уудыг pg_constraint-аас шалгаж байж нэмнэ (re-run найдвартай;
-- "relation already exists" 42P07-аас зайлсхийнэ).
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'tenants_manager_number_key') then
    alter table tenants add constraint tenants_manager_number_key unique (manager_number);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'tenants_manager_number_range') then
    alter table tenants add constraint tenants_manager_number_range
      check (manager_number is null or (manager_number >= 0 and manager_number <= 268435455));
  end if;
end $$;

-- ---- products.object_class (24-бит) + ext_key ----
-- Тенант тус бүрд барааны дугаарыг 1-ээс өсгөж онооно.
create table if not exists object_class_counters (
  tenant_id          uuid primary key references tenants(id) on delete cascade,
  last_object_class  bigint not null default 0
);
alter table object_class_counters enable row level security;
drop policy if exists "tenant object_class_counters" on object_class_counters;
create policy "tenant object_class_counters" on object_class_counters
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

alter table products add column if not exists object_class bigint;
alter table products add column if not exists ext_key text;
-- Баркодгүй бараа байхын тулд gtin-г NULL зөвшөөрнө.
alter table products alter column gtin drop not null;

-- Баркодгүй барааны давтагдалгүй индекс. NULL-уудыг Postgres ялгаатай гэж
-- үздэг тул GTIN-тэй бараа (ext_key = null) олон байж болно; харин баркодгүй
-- бараа (ext_key утгатай) давхцахгүй. upsert onConflict (tenant_id, ext_key).
create unique index if not exists products_tenant_extkey_uidx
  on products (tenant_id, ext_key);

-- Бараа insert хийхэд object_class автоматаар онооно (бараа болгонд).
create or replace function set_product_object_class()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.object_class is null then
    insert into object_class_counters (tenant_id, last_object_class)
    values (new.tenant_id, 0)
    on conflict (tenant_id) do nothing;

    update object_class_counters
       set last_object_class = last_object_class + 1
     where tenant_id = new.tenant_id
    returning last_object_class into new.object_class;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_product_object_class on products;
create trigger trg_product_object_class
  before insert on products
  for each row execute function set_product_object_class();

-- Хуучин бараануудад object_class нөхөж олгоно (тенант тус бүрд дараалан).
do $$
declare
  v_tenant uuid;
  v_prod   uuid;
  v_next   bigint;
begin
  for v_tenant in select distinct tenant_id from products where object_class is null loop
    insert into object_class_counters (tenant_id, last_object_class)
    values (v_tenant, 0) on conflict (tenant_id) do nothing;

    select last_object_class into v_next from object_class_counters
     where tenant_id = v_tenant for update;

    for v_prod in
      select id from products
       where tenant_id = v_tenant and object_class is null
       order by created_at, id
    loop
      v_next := v_next + 1;
      update products set object_class = v_next where id = v_prod;
    end loop;

    update object_class_counters set last_object_class = v_next
     where tenant_id = v_tenant;
  end loop;
end $$;

-- ============================================================
-- Шошгоны загвар (label designer)
--   Дизайнераар зурсан шошгоны template-ийг тенант тус бүрд хадгална.
--   objects = зурагласан объектуудын тодорхойлолт (текст/баркод/зураг/RFID…).
-- ============================================================
create table if not exists label_templates (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) default current_tenant_id(),
  name        text not null,
  width_mm    numeric not null default 54,
  height_mm   numeric not null default 34,
  dpi         int not null default 300,
  objects     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists label_templates_tenant_idx on label_templates (tenant_id, name);

-- Хэвлэх байрлал тааруулга (цаасны offset, мм). Хэвлэхэд бүх объектыг шилжүүлнэ.
alter table label_templates add column if not exists offset_x_mm numeric not null default 0;
alter table label_templates add column if not exists offset_y_mm numeric not null default 0;

alter table label_templates enable row level security;

drop policy if exists "tenant label_templates" on label_templates;
create policy "tenant label_templates" on label_templates
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

-- ============================================================
-- View: epc_full — EPC + бараа + ажлын талбарууд нэгтгэсэн (server-side
--   хайлт / эрэмбэ / хуудаслалтад). security_invoker = true тул underlying
--   хүснэгтүүдийн RLS хэрэгжинэ (зөвхөн өөрийн тенантын мөр харагдана).
--   Хүснэгтийн жагсаалтыг JS дотор бус, SQL талд хуудаслаж татна — олон
--   мянган/сая мөртэй ч хурдан.
-- ============================================================
-- epc_full view-г энэ файлын ТӨГСГӨЛД шилжүүлэв — бүх багана/хүснэгт (products.price,
-- categories г.м.) үүссэний дараа байхын тулд. (Доош, файлын төгсгөлийг харна уу.)

-- Хайлт хурдасгах trigram индексүүд (ilike-д). Том дата дээр чухал.
-- Тэмдэглэл: epc_hex нь char(24) тул gin_trgm_ops-д шууд тохирохгүй; 20k мөрд
-- ilike хурдан тул индексгүй орхив. name/sku нь text — trgm индекстэй.
create extension if not exists pg_trgm;
create index if not exists product_name_trgm on products using gin (name gin_trgm_ops);
create index if not exists product_sku_trgm  on products using gin (sku gin_trgm_ops);

-- ============================================================
-- Каталог (Phase 1): динамик ангилал + шинж чанарын тодорхойлолт
--   categories      — өөрийгөө заадаг мод (хэдэн ч түвшин)
--   attribute_defs  — тенант бүр өөрийн шинж чанарыг тодорхойлно
--                     (нэг компани "Размер", нөгөө нь "Өнгө" нэмж болно)
--   Утгыг (Phase 2) products.attributes jsonb-д хадгална.
-- ============================================================
create table if not exists categories (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) default current_tenant_id(),
  parent_id   uuid references categories(id) on delete cascade, -- null = дээд түвшин
  name        text not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists categories_tenant_idx on categories (tenant_id, parent_id, sort);

alter table categories enable row level security;
drop policy if exists "tenant categories" on categories;
create policy "tenant categories" on categories
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

create table if not exists attribute_defs (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) default current_tenant_id(),
  category_id uuid references categories(id) on delete cascade, -- null = бүх ангилалд
  label       text not null,                       -- "Өнгө", "Размер"
  input_type  text not null default 'text' check (input_type in ('text','number','select')),
  options     jsonb not null default '[]'::jsonb,  -- select-ийн сонголтууд ["Улаан","Хөх"]
  required    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists attribute_defs_tenant_idx on attribute_defs (tenant_id, category_id, sort);

alter table attribute_defs enable row level security;
drop policy if exists "tenant attribute_defs" on attribute_defs;
create policy "tenant attribute_defs" on attribute_defs
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

-- Audit trigger (хэн ангилал/шинж чанар өөрчилснийг хянана)
drop trigger if exists audit_categories on categories;
create trigger audit_categories
  after insert or update or delete on categories
  for each row execute function audit_trigger('category');

drop trigger if exists audit_attribute_defs on attribute_defs;
create trigger audit_attribute_defs
  after insert or update or delete on attribute_defs
  for each row execute function audit_trigger('attribute');

-- ---- Шинж чанарыг ГЛОБАЛ болгож, давхардсан нэрийг нэгтгэх ----
-- Олон улсын PIM-ийн дагуу шинж чанар нэг л глобал санд байна (ангилал бүрд
-- давтахгүй). Хуучин ангилалд хуваарилсан/давхардсан мөрийг цэгцэлнэ (re-run ОК).
update attribute_defs set category_id = null where category_id is not null;
delete from attribute_defs a using attribute_defs b
 where a.tenant_id = b.tenant_id
   and lower(btrim(a.label)) = lower(btrim(b.label))
   and a.ctid > b.ctid;

-- ============================================================
-- Каталог (Phase 2): бараа -> ангилал + динамик шинж чанарын утга
--   category_id — аль ангилалд (leaf) хамаарах
--   attributes  — шинж чанарын утгууд {"Өнгө":"Улаан","Размер":"L"}
--   Апп дотор бараа үүсгэхэд (баркодгүй → GID-96) ашиглана.
-- ============================================================
alter table products add column if not exists category_id uuid references categories(id);
alter table products add column if not exists attributes  jsonb not null default '{}'::jsonb;
-- Үнэ — тогтмол талбар (борлуулалтад хэрэгтэй; шинж чанар биш).
alter table products add column if not exists price numeric;
create index if not exists products_category_idx on products (tenant_id, category_id);

-- ============================================================
-- Phase 2: Салбар (branch) — EPC ширхэг бүр аль салбарт байгааг заана.
--   Бүтээгдэхүүн нийтийн, харин EPC instance нь салбарт харьяалагдана.
--   epc_full view (доор) branch_id/branch_name-ийг гаргана.
-- ============================================================
create table if not exists branches (
  id          uuid primary key default gen_random_uuid(),
  tenant_id   uuid not null references tenants(id) default current_tenant_id(),
  name        text not null,
  code        text,                      -- импортод таних код (нэрнээс найдвартай)
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);
create index if not exists branches_tenant_idx on branches (tenant_id, sort);
-- Код нь тенант дотор давтагдашгүй (импортод найдвартай таних). Хоосон код хязгааргүй.
create unique index if not exists branches_code_uniq
  on branches (tenant_id, lower(code)) where code is not null;

alter table branches enable row level security;
drop policy if exists "tenant branches" on branches;
create policy "tenant branches" on branches
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

drop trigger if exists audit_branches on branches;
create trigger audit_branches
  after insert or update or delete on branches
  for each row execute function audit_trigger('branch');

-- EPC-д салбар (одоогийн байршил)
alter table epc_codes add column if not exists branch_id uuid references branches(id);
create index if not exists epc_branch_idx on epc_codes (tenant_id, branch_id);

-- Тенант бүрд default салбар ("Үндсэн агуулах") + хуучин EPC-г түүнд оноох.
do $$
declare v_tenant uuid; v_branch uuid;
begin
  for v_tenant in select id from tenants loop
    select id into v_branch from branches where tenant_id = v_tenant order by created_at limit 1;
    if v_branch is null then
      insert into branches (tenant_id, name, code) values (v_tenant, 'Үндсэн агуулах', 'MAIN')
      returning id into v_branch;
    end if;
    update epc_codes set branch_id = v_branch where tenant_id = v_tenant and branch_id is null;
  end loop;
end $$;

-- Цэвэрлэгээ: "branch/салбар/box/price" зэрэг нөөц нэртэй шинж чанарыг арилгана.
-- (Эдгээр нь одоо тогтмол багана тул шинж чанар байх ёсгүй. Хуучин импортоос
--  санамсаргүй үүссэнийг цэгцэлнэ — re-run аюулгүй.)
delete from attribute_defs
 where lower(btrim(label)) in
   ('branch','салбар','салбарын дугаар','салбарын код','branch code','store','box','хайрцаг');
update products
   set attributes = attributes - 'branch' - 'Branch' - 'BRANCH' - 'салбар' - 'Салбар' - 'box' - 'Box'
 where attributes ?| array['branch','Branch','BRANCH','салбар','Салбар','box','Box'];

-- EPC бол түүхэн дата (тайлан/мөшгилт) — EPC бүртгэлтэй бараа устгаж БОЛОХГҮЙ
-- (RESTRICT). Цэвэрлэх шаардлагатай бол эхлээд холбогдох Ажлыг (job) устгана —
-- тэгвэл түүний EPC хамт устаж (job_id ON DELETE CASCADE), үлдэгдэлгүй болсон
-- барааг дараа нь устгах боломжтой болно. Доороос дээш дараалалтай.
alter table epc_codes drop constraint if exists epc_codes_product_id_fkey;
alter table epc_codes add constraint epc_codes_product_id_fkey
  foreign key (product_id) references products(id);  -- ON DELETE NO ACTION (=RESTRICT)

-- ============================================================
-- View: epc_full — EPC + бараа + ангилал + ажлын талбарууд нэгтгэсэн.
--   Файлын ТӨГСГӨЛД байрлуулсан — бүх багана (products.price/category_id/
--   attributes) болон categories хүснэгт үүссэний дараа.
--   security_invoker = true тул RLS хэрэгжинэ (зөвхөн өөрийн тенант).
-- ============================================================
drop view if exists epc_full;
create view epc_full
with (security_invoker = true) as
select
  e.id, e.tenant_id, e.serial, e.epc_hex, e.box_no,
  e.created_at, e.printed_at, e.status, e.job_id, e.product_id,
  e.branch_id, b.name as branch_name,
  p.name, p.gtin, p.sku, p.price,
  p.category_id,
  -- 3 түвшний ангилал (дээдээс доош). leaf нь L1/L2/L3-ийн аль нь ч байж болно.
  coalesce(c3.name, c2.name, c1.name) as category_l1,
  case when c3.id is not null then c2.name when c2.id is not null then c1.name end as category_l2,
  case when c3.id is not null then c1.name end as category_l3,
  c1.name as category_name, -- leaf (хуучин нэр, тааруулга)
  concat_ws(' / ',
    coalesce(c3.name, c2.name, c1.name),
    case when c3.id is not null then c2.name when c2.id is not null then c1.name end,
    case when c3.id is not null then c1.name end
  ) as category_path,
  p.attributes,
  (
    select string_agg(t.k || ': ' || t.v, ' · ' order by t.k)
    from jsonb_each_text(coalesce(p.attributes, '{}'::jsonb)) as t(k, v)
  ) as attributes_text,
  j.job_number, j.arrival_date, j.supplier
from epc_codes e
left join products   p  on p.id = e.product_id
left join branches   b  on b.id = e.branch_id
left join categories c1 on c1.id = p.category_id
left join categories c2 on c2.id = c1.parent_id
left join categories c3 on c3.id = c2.parent_id
left join jobs       j  on j.id = e.job_id;

grant select on epc_full to authenticated;

-- ============================================================
-- Phase 1: Бүтээгдэхүүн (master) — жагсаалт + үлдэгдэл, админ-only устгах
-- ============================================================

-- View: products_full — бүтээгдэхүүн + ангиллын түвшин + үлдэгдэл (EPC тоо).
drop view if exists products_full;
create view products_full
with (security_invoker = true) as
select
  p.id, p.tenant_id, p.name, p.sku, p.gtin, p.price, p.source, p.created_at,
  p.category_id, p.attributes,
  coalesce(c3.name, c2.name, c1.name) as category_l1,
  case when c3.id is not null then c2.name when c2.id is not null then c1.name end as category_l2,
  case when c3.id is not null then c1.name end as category_l3,
  -- epc_count = нийт EPC (устгалын хоригт); active_count = Идэвхтэй үлдэгдэл (Phase 4).
  (select count(*) from epc_codes e where e.product_id = p.id) as epc_count,
  (select count(*) from epc_codes e where e.product_id = p.id and e.status = 'active') as active_count
from products p
left join categories c1 on c1.id = p.category_id
left join categories c2 on c2.id = c1.parent_id
left join categories c3 on c3.id = c2.parent_id;
grant select on products_full to authenticated;

-- ============================================================
-- Phase 4: Үлдэгдэл — Идэвхтэй (active) EPC-ийн тоо, бараа × салбараар.
--   Матрицад JS талд pivot хийнэ. branch_id NULL = "(Салбаргүй)".
-- ============================================================
drop view if exists stock_by_branch;
create view stock_by_branch
with (security_invoker = true) as
select tenant_id, product_id, branch_id, count(*) as qty
from epc_codes
where status = 'active'
group by tenant_id, product_id, branch_id;
grant select on stock_by_branch to authenticated;

-- Админ-only УСТГАХ (products, epc_codes). select/insert/update нь тенантын гишүүдэд
-- (импорт/генерац/markPrinted ажиллахын тулд). "for all" policy-г задлан солино.
drop policy if exists "tenant products" on products;
drop policy if exists "products read"   on products;
drop policy if exists "products insert" on products;
drop policy if exists "products update" on products;
drop policy if exists "products delete" on products;
create policy "products read"   on products for select using (tenant_id = current_tenant_id());
create policy "products insert" on products for insert with check (tenant_id = current_tenant_id());
create policy "products update" on products for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy "products delete" on products for delete using (tenant_id = current_tenant_id() and is_tenant_admin());

drop policy if exists "tenant epc_codes" on epc_codes;
drop policy if exists "epc read"   on epc_codes;
drop policy if exists "epc insert" on epc_codes;
drop policy if exists "epc update" on epc_codes;
drop policy if exists "epc delete" on epc_codes;
create policy "epc read"   on epc_codes for select using (tenant_id = current_tenant_id());
create policy "epc insert" on epc_codes for insert with check (tenant_id = current_tenant_id());
create policy "epc update" on epc_codes for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());
create policy "epc delete" on epc_codes for delete using (tenant_id = current_tenant_id() and is_tenant_admin());

-- ============================================================
-- Phase 5: Гүйлгээ (transactions) — борлуулалт / шилжүүлэг / бусад.
--   Түүхэн бүртгэл: DELETE policy огт байхгүй — гүйлгээ хэзээ ч устахгүй.
--   Бүх бичилт atomic RPC-ээр (create_transaction / receive_transfer /
--   cancel_transfer) — статус, тенант, салбарын шалгалттай.
-- ============================================================
create table if not exists transactions (
  id           uuid primary key default gen_random_uuid(),
  tenant_id    uuid not null references tenants(id) default current_tenant_id(),
  type         text not null check (type in ('sale','transfer','other')),
  status       text not null default 'done' check (status in ('pending','done','cancelled')),
  from_branch  uuid references branches(id),
  to_branch    uuid references branches(id),          -- зөвхөн transfer
  note         text,
  created_by   uuid references auth.users(id) default auth.uid(),
  created_at   timestamptz not null default now(),
  completed_at timestamptz                            -- transfer хүлээн авсан огноо
);
create index if not exists tx_tenant_date_idx   on transactions (tenant_id, created_at desc);
create index if not exists tx_tenant_status_idx on transactions (tenant_id, status);

create table if not exists transaction_items (
  transaction_id uuid not null references transactions(id) on delete cascade,
  epc_id         uuid not null references epc_codes(id),  -- RESTRICT: гүйлгээтэй EPC устахгүй
  price          numeric,                                 -- гүйлгээний үеийн үнэ (snapshot)
  primary key (transaction_id, epc_id)
);
create index if not exists tx_items_epc_idx on transaction_items (epc_id);

alter table transactions      enable row level security;
alter table transaction_items enable row level security;

-- select/insert/update тенантын гишүүдэд; DELETE policy байхгүй (түүх хамгаалагдана).
drop policy if exists "tx read"   on transactions;
drop policy if exists "tx insert" on transactions;
drop policy if exists "tx update" on transactions;
create policy "tx read"   on transactions for select using (tenant_id = current_tenant_id());
create policy "tx insert" on transactions for insert with check (tenant_id = current_tenant_id());
create policy "tx update" on transactions for update using (tenant_id = current_tenant_id()) with check (tenant_id = current_tenant_id());

drop policy if exists "tx items read"   on transaction_items;
drop policy if exists "tx items insert" on transaction_items;
create policy "tx items read" on transaction_items for select
  using (exists (select 1 from transactions t where t.id = transaction_id and t.tenant_id = current_tenant_id()));
create policy "tx items insert" on transaction_items for insert
  with check (exists (select 1 from transactions t where t.id = transaction_id and t.tenant_id = current_tenant_id()));

drop trigger if exists audit_transactions on transactions;
create trigger audit_transactions
  after insert or update or delete on transactions
  for each row execute function audit_trigger('transaction');

-- ---------- RPC 1: Гүйлгээ үүсгэх (атом) ----------
-- p_type: sale|transfer|other. p_epc_ids: зөвхөн 'active' EPC, бүгд нэг салбарынх.
-- sale->sold, other->other (шууд 'done'); transfer->transferring ('pending').
create or replace function create_transaction(
  p_type text, p_to_branch uuid, p_note text, p_epc_ids uuid[]
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant   uuid := current_tenant_id();
  v_total    int  := coalesce(array_length(p_epc_ids, 1), 0);
  v_active   int;
  v_branches int;
  v_from     uuid;
  v_tx       uuid;
begin
  if v_tenant is null then
    raise exception 'Нэвтрээгүй байна.';
  end if;
  if p_type not in ('sale','transfer','other') then
    raise exception 'Гүйлгээний төрөл буруу (%).', p_type;
  end if;
  if v_total < 1 then
    raise exception 'EPC сонгоогүй байна.';
  end if;
  if p_type = 'transfer' and p_to_branch is null then
    raise exception 'Шилжүүлэгт очих салбараа сонгоно уу.';
  end if;

  -- Бүх EPC: тухайн тенантынх + Идэвхтэй байх ёстой.
  select count(*) into v_active
    from epc_codes
   where id = any(p_epc_ids) and tenant_id = v_tenant and status = 'active';
  if v_active <> v_total then
    raise exception 'Зарим EPC идэвхтэй биш эсвэл олдсонгүй (идэвхтэй %/%).', v_active, v_total;
  end if;

  -- Бүгд нэг салбарынх байх (NULL = "Салбаргүй" гэсэн нэг bucket).
  select count(distinct coalesce(branch_id, '00000000-0000-0000-0000-000000000000'::uuid)),
         min(branch_id::text)::uuid
    into v_branches, v_from
    from epc_codes
   where id = any(p_epc_ids) and tenant_id = v_tenant;
  if v_branches > 1 then
    raise exception 'Нэг гүйлгээнд зөвхөн нэг салбарын EPC оруулна (% салбар байна).', v_branches;
  end if;
  if p_type = 'transfer' and p_to_branch is not distinct from v_from then
    raise exception 'Очих салбар нь эх салбартай ижил байж болохгүй.';
  end if;

  -- Guard trigger (epc_guard_transferring)-ийг энэ transaction-д давах эрх.
  perform set_config('app.tx_rpc', '1', true);

  insert into transactions (tenant_id, type, status, from_branch, to_branch, note)
  values (
    v_tenant, p_type,
    case when p_type = 'transfer' then 'pending' else 'done' end,
    v_from,
    case when p_type = 'transfer' then p_to_branch else null end,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into v_tx;

  -- Items + үнийн snapshot (тухайн үеийн products.price).
  insert into transaction_items (transaction_id, epc_id, price)
  select v_tx, e.id, p.price
    from epc_codes e
    left join products p on p.id = e.product_id
   where e.id = any(p_epc_ids);

  update epc_codes
     set status = case p_type when 'sale' then 'sold'
                              when 'transfer' then 'transferring'
                              else 'other' end
   where id = any(p_epc_ids) and tenant_id = v_tenant and status = 'active';

  return v_tx;
end;
$$;
grant execute on function create_transaction(text, uuid, text, uuid[]) to authenticated;

-- ---------- RPC 2: Шилжүүлэг хүлээн авах ----------
create or replace function receive_transfer(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_tx     transactions%rowtype;
begin
  select * into v_tx from transactions
   where id = p_tx and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Гүйлгээ олдсонгүй.';
  end if;
  if v_tx.type <> 'transfer' or v_tx.status <> 'pending' then
    raise exception 'Зөвхөн хүлээгдэж буй шилжүүлгийг хүлээн авна.';
  end if;

  perform set_config('app.tx_rpc', '1', true);

  update epc_codes e
     set branch_id = v_tx.to_branch, status = 'active'
    from transaction_items ti
   where ti.transaction_id = p_tx and ti.epc_id = e.id
     and e.tenant_id = v_tenant and e.status = 'transferring';

  update transactions
     set status = 'done', completed_at = now()
   where id = p_tx;
end;
$$;
grant execute on function receive_transfer(uuid) to authenticated;

-- ---------- RPC 3: Шилжүүлэг цуцлах (EPC эх салбартаа Идэвхтэй буцна) ----------
create or replace function cancel_transfer(p_tx uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid := current_tenant_id();
  v_tx     transactions%rowtype;
begin
  select * into v_tx from transactions
   where id = p_tx and tenant_id = v_tenant
   for update;
  if not found then
    raise exception 'Гүйлгээ олдсонгүй.';
  end if;
  if v_tx.type <> 'transfer' or v_tx.status <> 'pending' then
    raise exception 'Зөвхөн хүлээгдэж буй шилжүүлгийг цуцална.';
  end if;

  perform set_config('app.tx_rpc', '1', true);

  update epc_codes e
     set status = 'active'
    from transaction_items ti
   where ti.transaction_id = p_tx and ti.epc_id = e.id
     and e.tenant_id = v_tenant and e.status = 'transferring';

  update transactions
     set status = 'cancelled', completed_at = now()
   where id = p_tx;
end;
$$;
grant execute on function cancel_transfer(uuid) to authenticated;

-- ---------- Хамгаалалт: 'transferring' төлөвийг зөвхөн гүйлгээний RPC удирдана ----------
-- Гараар (админ ч гэсэн) шилжүүлэгт яваа EPC-ийн төлөв өөрчилвөл гүйлгээ
-- 'pending' хэвээр үлдэж зөрчил үүснэ. RPC-ууд transaction-local тохиргоо
-- (app.tx_rpc) тавьдаг тул зөвхөн тэдгээр нь энэ шалгалтыг давна.
create or replace function epc_guard_transferring() returns trigger as $$
begin
  if new.status is distinct from old.status
     and current_setting('app.tx_rpc', true) is distinct from '1' then
    if old.status = 'transferring' then
      raise exception 'Энэ EPC шилжүүлэгт явж байгаа тул төлөвийг гараар өөрчлөх боломжгүй. Шилжүүлгийг "Хүлээн авах" эсвэл "Цуцлах" ашиглана уу.';
    end if;
    if new.status = 'transferring' then
      raise exception '"Шилжүүлж буй" төлөвийг гараар тохируулахгүй — Шилжүүлэг гүйлгээ ашиглана уу.';
    end if;
  end if;
  return new;
end $$ language plpgsql;

drop trigger if exists epc_no_manual_transferring on epc_codes;
create trigger epc_no_manual_transferring
  before update of status on epc_codes
  for each row execute function epc_guard_transferring();
