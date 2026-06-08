-- ============================================================
-- RFID EPC Generator — Supabase / Postgres schema
-- Multi-tenant + RLS + atomic serial allocation
-- Supabase SQL Editor дотор бүхэлд нь ажиллуулна.
-- ============================================================

create extension if not exists "pgcrypto";

-- ---------- tenants ----------
create table if not exists tenants (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  gs1_company_prefix    text not null,          -- тенантын GS1 угтвар (6-12 орон)
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
create table if not exists products (
  id              uuid primary key default gen_random_uuid(),
  tenant_id       uuid not null references tenants(id) default current_tenant_id(),
  source_gtin     text,                  -- үйлдвэрлэгчийн GTIN: ЗӨВХӨН таних/тааруулахад
  indicator       smallint not null default 0,
  item_reference  text not null,         -- тенантын prefix дор оноосон, EPC минтлэхэд
  name            text,
  source          text not null default 'in_app' check (source in ('packing_list','in_app')),
  created_at      timestamptz not null default now(),
  unique (tenant_id, item_reference)
);
create index if not exists products_tenant_gtin_idx on products (tenant_id, source_gtin);

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
-- Row-Level Security
-- ============================================================
alter table tenants         enable row level security;
alter table profiles        enable row level security;
alter table products        enable row level security;
alter table serial_counters enable row level security;
alter table jobs            enable row level security;
alter table epc_codes       enable row level security;

-- profiles: хэрэглэгч зөвхөн өөрийн профайлыг харна
create policy "own profile" on profiles
  for select using (id = auth.uid());

-- tenants: гишүүн зөвхөн өөрийн тенантыг харна
create policy "own tenant" on tenants
  for select using (id = current_tenant_id());

-- Тенантын мөрүүд: бүрэн хандалт зөвхөн өөрийн тенантад
create policy "tenant products" on products
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

create policy "tenant serial_counters" on serial_counters
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

create policy "tenant jobs" on jobs
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());

create policy "tenant epc_codes" on epc_codes
  for all using (tenant_id = current_tenant_id())
          with check (tenant_id = current_tenant_id());
