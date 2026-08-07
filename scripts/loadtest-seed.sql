-- ============================================================
-- Ачааллын тестийн seed — "LT-" угтвартай ХИЙМЭЛ дата.
-- Supabase SQL Editor дээр бүхэлд нь Run (ХЭД Ч УДАА болно — idempotent:
-- давхардсан GTIN/job/EPC алгасна). Дараа нь scripts/loadtest.mjs-ээр хэмж.
--
-- Юу үүсгэдэг: v_products ширхэг "LT бараа NNN" + нэг "LT-0001" ажил +
-- v_epc_count ширхэг EPC (~80% Идэвхтэй / 10% Борлуулсан / 5% Бусад /
-- 5% Хэвлээгүй; тенантын БҮХ салбарт ээлжлэн тарааж байрлуулна — Хэвлээгүй
-- нь салбаргүй). epc_hex нь 'ADED…' угтвартай хиймэл hex (жинхэнэ SGTIN
-- биш) — query-ийн ачааллыг хэмжихэд хангалттай.
-- Insert бүрд epc_events trigger 'created' event бичнэ (бодит ачаалалтай ижил).
--
-- Цэвэрлэгээ: файлын доод хэсгийн коммент болгосон блокыг Run.
-- ============================================================

do $$
declare
  -- ↓↓↓ ӨӨРИЙНХ ИЙГ БИЧНЭ ↓↓↓
  v_email     text := 'bmdtamir@gmail.com'; -- нэвтэрдэг имэйл (тенантыг олоход)
  v_epc_count int  := 50000;             -- нийт EPC
  v_products  int  := 50;                -- LT бараа
  -- ↑↑↑ ─────────────────── ↑↑↑
  v_tenant     uuid;
  v_branch_ids uuid[];
  v_bn         int;
  v_job        uuid;
  v_prod_ids   uuid[];
  v_n          int;
  i            int;
begin
  select p.tenant_id into v_tenant
    from profiles p join auth.users u on u.id = p.id
   where u.email = v_email;
  if v_tenant is null then
    raise exception 'Имэйл "%" -тэй профайл/тенант алга — v_email-ээ шалга.', v_email;
  end if;

  -- Салбарууд: EPC-үүдийг БҮХ салбарт ээлжлэн тарааж байрлуулна — ингэснээр
  -- Үлдэгдлийн матриц олон баганатай, салбарын scoping (оператор гэх мэт
  -- хязгаарлагдсан эрхтэй хэрэглэгч) ч жинхэнэ нөхцөлөөр шалгагдана.
  select array_agg(id order by created_at) into v_branch_ids
    from branches where tenant_id = v_tenant;
  v_bn := coalesce(array_length(v_branch_ids, 1), 0);
  if v_bn = 0 then
    raise exception 'Тенантад салбар алга — эхлээд салбар үүсгэ.';
  end if;

  -- LT бараанууд (GTIN давхцвал алгасна — дахин Run хийхэд аюулгүй)
  for i in 1..v_products loop
    insert into products (tenant_id, name, sku, gtin, price, cost)
    values (v_tenant,
            'LT бараа ' || lpad(i::text, 3, '0'),
            'LT-' || lpad(i::text, 3, '0'),
            '2990000' || lpad(i::text, 6, '0'),
            (1000 + (i * 137) % 90000)::numeric,
            (500  + (i * 73)  % 40000)::numeric)
    on conflict (tenant_id, gtin) do nothing;
  end loop;

  select array_agg(id order by sku) into v_prod_ids
    from products where tenant_id = v_tenant and sku like 'LT-%';
  v_n := coalesce(array_length(v_prod_ids, 1), 0);
  if v_n = 0 then
    raise exception 'LT бараа үүссэнгүй — products insert-ээ шалга.';
  end if;

  insert into jobs (tenant_id, job_number, arrival_date, supplier, note, status)
  values (v_tenant, 'LT-0001', current_date, 'Ачааллын тест', 'loadtest seed', 'generated')
  on conflict (tenant_id, job_number) do nothing;
  select id into v_job from jobs where tenant_id = v_tenant and job_number = 'LT-0001';

  -- EPC-үүд. serial = 1000000+g (жинхэнэ тоолууртай мөргөлдөхгүй өндөр муж);
  -- epc_hex давхцвал алгасна (2 дахь Run юу ч нэмэхгүй).
  insert into epc_codes (tenant_id, job_id, product_id, box_no, serial, epc_hex,
                         status, branch_id, printed_at, print_count)
  select v_tenant, v_job,
         v_prod_ids[(g % v_n) + 1],
         'LT-' || ((g % 40) + 1),
         1000000 + g,
         'ADED' || lpad(to_hex(g), 20, '0'),
         st.s,
         -- Хэвлээгүй = салбаргүй; бусад нь салбаруудад ээлжлэн (round-robin).
         case when st.s = 'unprinted' then null else v_branch_ids[(g % v_bn) + 1] end,
         case when st.s = 'unprinted' then null else now() end,
         case when st.s = 'unprinted' then 0 else 1 end
    from generate_series(1, v_epc_count) g
   cross join lateral (select case
           when g % 20 = 19 then 'unprinted'
           when g % 20 = 18 then 'other'
           when g % 10 >= 8 then 'sold'
           else 'active' end as s) st
      on conflict (tenant_id, epc_hex) do nothing;

  raise notice 'LT seed бэлэн: % бараа, % салбарт тараасан, EPC нийт %',
    v_n, v_bn, (select count(*) from epc_codes where tenant_id = v_tenant and epc_hex like 'ADED%');
end $$;

-- ============================================================
-- ЦЭВЭРЛЭГЭЭ (хэрэгтэй үедээ коммент тайлаад Run — LT датаг бүрэн устгана).
-- Устгалын хориг Хэвлээгүйгээс бусдыг хамгаалдаг тул эхлээд unprinted болгоно
-- (status_change event бичигдэнэ, дараа нь EPC-тэй хамт cascade устна).
-- ============================================================
-- do $$
-- declare v_tenant uuid;
-- begin
--   select p.tenant_id into v_tenant
--     from profiles p join auth.users u on u.id = p.id
--    where u.email = 'you@company.com';           -- ← өөрийн имэйл
--   update epc_codes set status = 'unprinted'
--    where tenant_id = v_tenant and epc_hex like 'ADED%' and status <> 'unprinted';
--   delete from epc_codes where tenant_id = v_tenant and epc_hex like 'ADED%';
--   delete from jobs      where tenant_id = v_tenant and job_number = 'LT-0001';
--   delete from products  where tenant_id = v_tenant and sku like 'LT-%';
-- end $$;
