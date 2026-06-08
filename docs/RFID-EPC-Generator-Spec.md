# RFID EPC Generator — Спек (v0.1)

> Импортын барааны packing list-ээс GS1 стандартын дагуу серилизэцлэгдсэн RFID EPC (SGTIN-96) код үүсгэдэг, олон компанийн (multi-tenant) веб апп.

---

## 1. Зорилго

Тенант (компани) packing list-ээ оруулахад, бараа бүрийн тоо ширхэгээр нь GS1 SGTIN-96 EPC код автоматаар үүсгэж, RFID таг руу бичих боломжтой hex форматаар буцаах. Бараа бүрийн serial дугаар тенант доторх тухайн барааны хувьд **хэзээ ч давтагдахгүй, дараалсан** байна.

---

## 2. Гол ойлголтууд (GS1 / EPC)

| Нэр томьёо | Тайлбар |
|---|---|
| **GTIN** | Global Trade Item Number — барааны таних код (8/12/13/14 орон). |
| **GS1 Company Prefix** | GS1-ээс компанид олгосон давтагдашгүй угтвар (6–12 орон). Тенант бүр өөрийнхтэй. |
| **SGTIN** | Serialized GTIN — GTIN + serial дугаар = ширхэг бүрийн давтагдашгүй ID. |
| **EPC** | Electronic Product Code — RFID таг дээр бичигдэх код. |
| **SGTIN-96** | 96-bit урттай EPC кодлох схем. Хамгийн түгээмэл RFID формат. |
| **Filter value** | Барааны түвшин (ширхэг / хайрцаг / паллет) заадаг 3-bit утга. |
| **Serial** | Ширхэг бүрийн давтагдашгүй дугаар (SGTIN-96-д 38 bit, дээд тал нь 274,877,906,943). |

---

## 3. Хэрэглэгчийн үндсэн урсгал

1. Тенант системд **нэвтэрнэ** (зөвхөн өөрийн дата харагдана).
2. **Шинэ Ажил (Job) үүсгэж packing list оруулна** (гараар нэмэх, эсвэл CSV/Excel-ээс import).
   - Job бүр: ажлын дугаар, **ирсэн огноо**, нийлүүлэгч, статус.
   - Мөр бүр: бараа (ирсэн GTIN эсвэл апп доторх каталогийн бараа) + **тоо ширхэг**.
3. Систем мөр бүрд:
   - Тухайн барааны хамгийн сүүлд хүрсэн serial-аас үргэлжлүүлэн (анх удаа бол 1-ээс) тоо ширхэгийн тоогоор serial оноож,
   - Serial бүрд **тенантын өөрийн prefix дор** SGTIN-96 **hex EPC** үүсгэнэ.
4. Үр дүнг хүснэгтээр харуулж, **export** (CSV) болон/эсвэл RFID принтер рүү дамжуулна.
5. Бүх Job, үүсгэсэн EPC нь **тенантын түүхэнд** хадгалагдана.
6. Сүүлд **огноогоор, ажлаар, бараагаар шүүж** үзнэ — "энэ сарын хэдэнд аль ажил дээр ямар бараа ирсэн".

---

## 4. EPC үүсгэх логик (SGTIN-96)

### 4.1 Бүтэц (96 bit)

```
[ Header 8b ][ Filter 3b ][ Partition 3b ][ Company Prefix ][ Item Ref ][ Serial 38b ]
   0x30        0-7           0-6            (хувьсах)         (хувьсах)
```

- **Header** = `0x30` (SGTIN-96-г заана).
- **Filter** = ширхэгийн түвшин. Default `1` (жижиглэн худалдааны нэгж бараа). Тохируулж болно.
- **Partition** = Company Prefix-ийн уртаар автоматаар тодорхойлогдоно (доорх хүснэгт).
- **Company Prefix + Item Ref** = GTIN-аас гаргаж авна.
- **Serial** = тенант × барааны дараалсан тоолуур.

### 4.2 Partition хүснэгт (SGTIN)

| Prefix орон | Partition | Prefix bit | Item Ref bit | Item Ref орон |
|---|---|---|---|---|
| 12 | 0 | 40 | 4 | 1 |
| 11 | 1 | 37 | 7 | 2 |
| 10 | 2 | 34 | 10 | 3 |
| 9 | 3 | 30 | 14 | 4 |
| 8 | 4 | 27 | 17 | 5 |
| 7 | 5 | 24 | 20 | 6 |
| 6 | 6 | 20 | 24 | 7 |

> Company Prefix хэдэн оронтой байгаагаар partition сонгогдоно. Item Ref-ийн орон = `13 − (prefix орон)`.

### 4.3 GTIN → Indicator + Item Reference

GTIN-14 = `Indicator(1)` + `Company Prefix(N)` + `Item Reference(12−N)` + `Check digit(1)`.

SGTIN кодлоход:
- **Check digit-ийг хасна.**
- **Indicator + Item Reference**-ийг нийлүүлж нэг тоо болгож (нийт `13 − N` орон) кодлоно.
- Ширхэг түвшний бараанд Indicator ихэвчлэн `0`.

> **Чухал дүрэм:** EPC-д ашиглах Company Prefix нь **үргэлж тенантын өөрийн prefix** байна. Packing list дээр үйлдвэрлэгчийн GTIN ирсэн ч, түүнийг зөвхөн барааг **таних/тааруулахад** хэрэглэж, EPC-г тенантын prefix + тенантад оноосон item reference-ээр үүсгэнэ. Энэ нь тенант хооронд EPC давхцахаас сэргийлнэ (§5.1).

### 4.4 Serial counter (гол бизнес дүрэм)

- Тоолуур нь **(tenant_id, gtin) хослол бүрд тус тусдаа** ажиллана.
- Бараа **анх удаа** ирэхэд `1`-ээс эхэлнэ.
- Тухайн бараа **дахин** ирэхэд хамгийн сүүлд олгосон serial-аас **үргэлжилнэ** (дахин 1 болохгүй).
- Serial хэзээ ч дахин ашиглагдахгүй (хүчингүй болсон ч).
- Дээд хязгаар: `2^38 − 1`. Хэтэрвэл анхааруулга өгнө.

**Жишээ:** Бараа А (GTIN X) анх 10ш → serial 1–10. Дараа нь А дахин 5ш → serial 11–15. Бараа Б анх ирэв → өөрийн 1-ээс.

### 4.5 Баталгаажсан worked example

Тенант prefix `8600001` (7 орон → partition 5), item ref `012345`, filter `1`:

| Serial | SGTIN-96 hex (24 тэмдэгт) |
|---|---|
| 1 | `30360CE7040C0E4000000001` |
| 2 | `30360CE7040C0E4000000002` |
| 3 | `30360CE7040C0E4000000003` |

> Сүүлийн 38 bit (serial) л өөрчлөгдөж байгааг анхаараарай. Дээрх алгоритмыг GS1-ийн стандарт жишээ (`urn:epc:tag:sgtin-96:3.0614141.812345.6789` → `3074257BF7194E4000001A85`) дээр шалгаж, **яг таарсан**.

### 4.6 Хяналт (validation)

- GTIN check digit зөв эсэхийг шалгана.
- Company Prefix урт нь partition хүснэгтэд багтаж байгаа эсэх.
- Item Ref нь зөвшөөрөгдсөн орны тоонд багтаж байгаа эсэх (тэгээр гүйцээх).
- Serial 38-bit хязгаарт байгаа эсэх.

---

## 5. Multi-tenant загвар

- Компани бүр = **нэг tenant**. Тенант бүр өөрийн **GS1 Company Prefix**-тэй.
- Хэрэглэгч зөвхөн өөрийн тенантын дата хардаг, засдаг (хатуу тусгаарлалт).
- Дата тусгаарлалтыг **Postgres Row-Level Security (RLS)**-ээр баталгаажуулна — мөр бүр `tenant_id`-тэй, бодлого нь зөвхөн нэвтэрсэн хэрэглэгчийн тенантын мөрийг гаргана.

### 5.1 Tenant хооронд EPC давхцал (чухал)

**Асуудал:** Өөр 2 тенант дээр нэг ижил бараа ирэхэд EPC давхцах уу?

**Шийдэл:** Үгүй — хэрэв EPC-г **үргэлж тенантын өөрийн GS1 Company Prefix дор** үүсгэвэл. GS1 нь Company Prefix бүрийг дэлхийд давтагдашгүй болгож олгодог тул:

- Тенант А, Тенант Б хоёр яг ижил барааг хоёулаа serial `1`-ээс эхлүүлсэн ч → prefix нь өөр учраас үүсэх EPC нь **огт өөр, хэзээ ч давхцахгүй**.

**Зайлсхийх алдаа:** Хоёр тенант packing list дээрх **үйлдвэрлэгчийн нэг GTIN**-г (нэг prefix) шууд ашиглаад хоёулаа serial 1-ээс эхэлбэл → яг ижил EPC үүсч **давхцана**. Тиймээс үйлдвэрлэгчийн GTIN-г зөвхөн таних талбар (`source_gtin`) болгон хадгалж, EPC-г тенантын prefix-ээр минтлэнэ.

> Энэ нь импортлогчийн дотоод/хаалттай RFID хяналтад стандарт зөв арга. Нээлттэн нийлүүлэлтийн сүлжээнд бусдын GTIN-г дахин таглахыг зөвлөдөггүй, харин агуулахын дотоод хяналтад өөрийн prefix-ээр таглах нь түгээмэл.

---

## 6. Дата загвар (DB хүснэгтүүд)

```
tenants
  id (uuid, pk)
  name
  gs1_company_prefix      -- тенантын GS1 угтвар
  default_filter_value    -- default 1
  created_at

users                     -- (Supabase auth.users-тэй холбоно)
  id (uuid, pk)
  tenant_id (fk -> tenants)
  email
  role                    -- admin / operator

products                  -- тенантын барааны каталог
  id (uuid, pk)
  tenant_id (fk)
  source_gtin             -- үйлдвэрлэгчийн GTIN (заавал биш, зөвхөн ТАНИХ/тааруулахад)
  indicator               -- EPC-д ашиглах, ихэвчлэн 0
  item_reference          -- тенантын prefix дор оноосон, EPC минтлэхэд ашиглана
  name
  source                  -- 'packing_list' | 'in_app'
  UNIQUE (tenant_id, item_reference)         -- тенант доторх EPC-ийн суурь давхцалгүй
  -- source_gtin-аар хайхад зориулж (tenant_id, source_gtin) дээр index

serial_counters           -- бараа бүрийн сүүлийн serial
  tenant_id (fk)
  product_id (fk)
  last_serial (bigint)    -- атомаар нэмэгдэнэ
  PRIMARY KEY (tenant_id, product_id)

jobs                      -- нэг удаагийн packing list = нэг Ажил
  id (uuid, pk)
  tenant_id (fk)
  job_number              -- ажлын дугаар (тенант доторх дараалал)
  arrival_date (date)     -- бараа ирсэн огноо  ← огноогоор шүүхэд
  supplier                -- нийлүүлэгч (заавал биш)
  note
  status                  -- 'draft' | 'generated' | 'printed'
  created_at
  UNIQUE (tenant_id, job_number)

epc_codes                 -- үүсгэсэн EPC бүрийн түүх
  id (uuid, pk)
  tenant_id (fk)
  job_id (fk)             -- аль ажил дээр үүссэн  ← ажлаар шүүхэд
  product_id (fk)
  serial (bigint)
  epc_hex (char(24))
  created_at
  UNIQUE (tenant_id, product_id, serial)   -- давхцал гарахаас хамгаална
  UNIQUE (tenant_id, epc_hex)              -- EPC-ээр буцаах хайлт + давхцал хамгаалалт
  -- (tenant_id, job_id) болон (tenant_id, created_at) дээр index → огноо/ажлаар шүүлт
```

---

## 7. Backend зөвлөмж — **Supabase**

**Зөвлөмж: Supabase.** Шалтгаан:

- **Multi-tenant + auth бэлэн.** Хэрэглэгчийн нэвтрэлт, RLS-ээр тенант тусгаарлалт хийхэд хамгийн хурдан зам. Өөрийн auth/session бичих шаардлагагүй.
- **Postgres** — serial тоолуурын атом нэмэгдэлтийг транзак/`UPDATE ... RETURNING`-ээр найдвартай хийнэ (доор үзнэ үү).
- **Vite + React-тай амар холбогдоно** (`@supabase/supabase-js`), Claude Code web sandbox дотор асуудалгүй ажиллана.
- **Хостинг + DB нэг дор**, үнэгүй tier-тэй — MVP-д хангалттай.

> Хэрэв ирээдүйд илүү нарийн серверийн логик (тагийн принтертэй интеграц, том багц боловсруулалт) хэрэгтэй бол Supabase Edge Functions эсвэл тусдаа Node API-аар өргөтгөж болно. Эхлэхдээ Supabase дангаар хангалттай.

---

## 8. Serial давхцалгүй байх баталгаа (хамгийн чухал)

Хоёр packing list зэрэг орвол serial давхцаж болзошгүй. Үүнээс сэргийлэхийн тулд тоолуурыг **атом** (atomic) нэмэгдүүлнэ. Postgres функц жишээ:

```sql
-- Тухайн бараанд n ширхэг serial "захиалж" авна.
-- Эхлэх serial-аас n хүртэлх блокийг буцаана.
create or replace function allocate_serials(
  p_tenant uuid, p_product uuid, p_count int
) returns bigint as $$
declare start_serial bigint;
begin
  insert into serial_counters (tenant_id, product_id, last_serial)
  values (p_tenant, p_product, 0)
  on conflict (tenant_id, product_id) do nothing;

  update serial_counters
     set last_serial = last_serial + p_count
   where tenant_id = p_tenant and product_id = p_product
  returning last_serial - p_count + 1 into start_serial;

  return start_serial;  -- [start_serial .. start_serial + p_count - 1]
end;
$$ language plpgsql;
```

App нь зөвхөн энэ функцээр serial авч, тэр блок дээр SGTIN-96 hex-ийг тооцоолно. `epc_codes` дээрх `UNIQUE (tenant_id, product_id, serial)` нь нэмэлт хамгаалалт.

---

## 9. MVP scope (Phase 1)

**Багтах зүйл:**

- Тенант нэвтрэлт (Supabase auth), тенант тус бүрийн дата тусгаарлалт.
- Тенантын тохиргоо: GS1 Company Prefix, default filter value.
- Барааны каталог: ирсэн GTIN-аар тааруулах **эсвэл** апп дотор item reference оноох (хоёуланг дэмжих). EPC нь үргэлж тенантын prefix дор.
- **Ажил (Job)** үүсгэх: ирсэн огноо, нийлүүлэгч; packing list гараар оруулах + CSV import.
- SGTIN-96 **hex** EPC үүсгэх (дараалсан serial, тенант доторх ба тенант хооронд давхцалгүй).
- Үр дүнг хүснэгтээр харах + CSV export.
- **Түүх + шүүлт:** огноогоор, ажлаар, бараагаар шүүж харах.
- **EPC-ээр буцаах хайлт:** EPC hex бичээд хайхад → аль ажил, ямар бараа, хэдэн дэх serial, хэзээ үүссэнийг харуулна.

**Дараагийн Phase-д үлдээх:**

- RFID принтер/энкодертой шууд интеграц (ZPL гэх мэт).
- EPC URI (`urn:epc:id:sgtin:...`) нэмэлт формат.
- Хайрцаг/паллет түвшний (SSCC) код.
- Role/эрхийн нарийн удирдлага, аудит лог.
- Багц боловсруулалтын тайлан, статистик.

---

## 10. Технологийн стек

| Давхарга | Сонголт |
|---|---|
| Frontend | **Vite + React** (+ TypeScript санал болгоё) |
| UI | Tailwind CSS (хурдан, Claude Code web-д тохиромжтой) |
| Backend / DB / Auth | **Supabase** (Postgres + RLS + Auth) |
| EPC логик | Цэвэр TS функц (frontend + DB функцэд хуваан хэрэгжүүлж болно) |
| Хостинг | Supabase + Vercel/Netlify (frontend) |
| Version control | **GitHub** (Claude Code web-ийн loop-д зайлшгүй) |

---

## Хавсралт A — GitHub + Claude Code web loop тохируулга

Лаптоп болон утаснаас зэрэг засах урсгал:

1. **Лаптоп дээр:** төслийн фолдер үүсгэж `git init`, `vite` scaffold хийнэ.
2. GitHub дээр **private repo** үүсгэж, `git remote add origin ...` → `git push`.
3. **Утсан дээр:** Claude app нээх → Claude Code → GitHub-аа холбож энэ repo-г сонгох.
4. Засвар хийх:
   - **Лаптоп:** локалаар код бичээд `git push`.
   - **Утас:** Claude Code web-д даалгавар өгнө → cloud sandbox дотор засаад **PR** нээнэ → утаснаасаа шалгаад merge.
5. Аль ч талаас засахын өмнө `git pull` хийж синк байлгана (эсвэл бүх засварыг PR-аар дамжуулж, `main`-г цэвэр байлгана).

> Зөвлөмж: бүх өөрчлөлтийг PR-аар оруулбал лаптоп ↔ утас хооронд зөрчил багасна. Жижиг засварыг утаснаас, том ажлыг лаптопоос.
