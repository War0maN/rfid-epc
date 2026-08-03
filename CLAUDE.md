# CLAUDE.md — Кодын архитектур ба тогтсон зарчмууд

RFID EPC Generator: Vite + React 19 + TS + Tailwind + Supabase (Postgres/RLS/Auth), multi-tenant, **UI бүхэлдээ Монгол хэлээр**. Дэлгэрэнгүй ойлголтууд: `docs/architecture.md`.

## Ажлын урсгал

- Схемийн эх сурвалж = `docs/schema.sql` (migration-style, **idempotent**). Схем өөрчилбөл хэрэглэгч Supabase SQL Editor дээр файлыг бүхэлд нь дахин Run хийнэ — үүнийг өөрчлөлт бүрт сануул.
- Git: feature branch → хэрэглэгч гараар туршина → commit → **branch-ээ GitHub рүү түлхэж CI ногоон болгоно** → `main`-д **зөвхөн fast-forward** merge → push. Commit-ийн өмнө `npx tsc -b` + eslint + `npm test` заавал цэвэр.
- **`main` хамгаалагдсан (ruleset "main protection", 2026-08-03):** CI-ийн `check` ногоон болоогүй commit `main`-д ОРОХГҮЙ (push-ыг GitHub татгалзана), force-push ба `main` устгах хориотой, **эзэнд нь ч хамаарна** (bypass алга). Тиймээс merge хийхийн ӨМНӨ branch-ээ түлхэж CI-г хүлээх ёстой — ff-merge үед commit-ийн SHA хэвээр тул тэнд авсан ногоон тэмдэг main дээр хүчинтэй байна.
- Туршилт: `npm run dev` (localhost:5173/5174), хэрэглэгч UI-гаас туршиж баталгаажуулдаг.
- **Автомат тест (vitest, `npm test`):** зөвхөн ЦЭВЭР функцүүдэд — EPC кодлол/задлалт (`lib/epc.ts`), тайлангийн бүлэглэлт/томьёо (movement/stocktakeReport/txReports), format/exportCsv/permissions/epcStatus, 3 хэлний түлхүүрийн паритет. DB/RLS/UI тест ҮГҮЙ (тэдгээрийг хэрэглэгч UI-гаас туршдаг). Орчин: node + `src/test/setup.ts` (localStorage хуурамч) + `vitest.config.ts`-ийн хуурамч VITE_SUPABASE_* — тест сүлжээнд хандахгүй. Шинэ цэвэр функц нэмбэл `<файл>.test.ts` дагалдуулна.

## Халдашгүй зарчмууд

1. **Устгалын зарчим (хатуу RESTRICT, доороос дээш):** түүхэн дата хэзээ ч устгагдахгүй. Гүйлгээ (`transactions`) устгах DELETE policy огт байхгүй. EPC: Борлуулсан/Шилжүүлж буй/Бусад гүйлгээт `epc_block_active_delete` trigger-ээр, гүйлгээний түүхтэй нь `transaction_items` FK (RESTRICT)-ээр хамгаалагдана. Шинэ FK-д default (RESTRICT) ашигла; cascade зөвхөн "хамт үүсдэг, хамт устах нь зөв" зүйлд (job→unprinted epc, epc→events).
2. **Залруулга = устгал биш, сөрөг үйлдэл:** буцаалт (return гүйлгээ), шилжүүлэг цуцлах, гараар төлөв солих (тэмдэглэлтэй, түүхэнд бичигдэнэ).
3. **Бүх бичилт хамгаалалттай 2 давхаргатай:** UI нуух нь зөвхөн ая тух; жинхэнэ хориг DB талд (RLS policy эсвэл RPC доторх шалгалт).

## DB хэв маягууд (schema.sql)

- **Атом олон бичилт = security definer RPC** (`create_transaction`, `receive_transfer`, `cancel_transfer`, `change_epc_status`, `set_member_branches`, `set_member_perms`). Security definer нь RLS-ийг ТОЙРДОГ тул тенант/салбар/эрхийн шалгалтыг RPC дотор заавал хий.
- **RPC↔trigger холбоо transaction-local тохиргоогоор:** `set_config('app.tx_rpc'|'app.tx_id'|'app.reason', ..., true)` — guard trigger давах эрх, event-ийг гүйлгээтэй холбох, тэмдэглэл дамжуулах.
- **⚠️ RLS гүйцэтгэлийн сургамж:** policy дотор security definer функцийг мөр бүрд дуудаж БОЛОХГҮЙ (20k мөрөнд statement timeout болсон). Оронд нь нэг удаа тооцогдох хэлбэр: `(select is_tenant_admin())`, `(select has_perm('...'))` (InitPlan) + `col in (select ... from user_branches ...)` (hashed subplan).
- **Event log:** `epc_events` append-only; `epc_codes`-ийн insert/update trigger автоматаар бичдэг тул кодын аль ч зам мартагдахгүй. Шинэ статус шилжилт нэмбэл trigger-ийн case-д нэм.
- **Үнэ snapshot:** гүйлгээний үед `transaction_items.price`-д хадгална (тайлан үүн дээр). Барааны `price` (зарах) + `cost` (өртөг, сонголтоор) хоёулаа бий — Хөдөлгөөний тайлан хоёр үнэлгээгээр.
- **Гүйлгээний дугаар төрлөөр:** TRF/SAL/RTN/ADJ-0001 (тенант бүрд тусдаа дэс, `create_transaction` дотор retry-той) — RCV/ST дэстэй ижил хэв маяг.
- **Тайлангийн RPC хэв маяг:** том нэгтгэл DB талд `report_*` (sales/inflow/stocktake/movement) — **security invoker** (RLS/scoping автоматаар), бүлэглэлт client талд. `report_movement` event нэрээр биш **төлөвийн шилжилтээр** тоолдог (томьёо өөрөө шалгагдана). Шилжүүлэг/Актлалтын тайлан client-side (lib/txReports.ts).
- **Тооллогын илүү:** скан үеийн төлөв/салбар `stocktake_scans.scan_status/scan_branch`-д хөлддөг (хаагдсан тооллого = хөлдсөн баримт); `absorb_stocktake_extras` зөвхөн Идэвхтэй/Хэвлээгүйг энэ салбарт бүртгэнэ — Борлуулсан/Бусад буцаалтаар л сэргэнэ.
- **Шошгоны хэрэглээ (2026-07-29):** `epc_codes.printed_at` = АНХ хэвлэсэн огноо (өөрчлөгдөхгүй), `print_count` = хэвлэсэн нийт удаа = **физик зарцуулагдсан шошго**. Хэвлэлт зөвхөн `mark_printed(uuid[])` RPC-ээр (security **invoker** — "epc update" policy буюу act_print + салбарын scoping өөрөө хэрэгжинэ). Дахин хэвлэхэд төлөв/printed_at хэвээр, зөвхөн print_count +1 → trigger `reprinted` event бичнэ (хугацааны цуваа). ⚠️ Backfill (`print_count = 1`) нь `app.print_backfill='1'` тугтай — үүнгүй бол trigger өмнө хэвлэгдсэн EPC БҮРД хуурамч `reprinted` бичнэ.
- **Платформын хяналт (2026-07-29):** тенант хооронд харах цорын ганц зам = `platform_admins` хүснэгт (RLS-тэй ч **policy огт алга** — гараар SQL-ээс л мөр нэмнэ) + `is_platform_admin()` + `platform_overview()`/`platform_label_series()` **security definer** RPC-ууд, эрхийн шалгалт функцийн эхний мөрөнд. OUT параметр нь хүснэгтийн нэртэй давхцдаг тул `#variable_conflict use_column` заавал. ⚠️ Клиентэд service_role түлхүүр ХЭЗЭЭ Ч тавихгүй.
- **"Хоосон тохиргоо = хязгааргүй" семантик:** `user_branches`/`user_permissions`-д мөргүй хэрэглэгч бүрэн эрхтэй (default, backward compatible); админ үргэлж бүрэн.
- View-үүд `security_invoker = true` тул RLS автоматаар үйлчилнэ — scoping нэмэхэд view өөрчлөх шаардлага ихэвчлэн гардаггүй.
- DB-ийн raise exception мессежүүд Монголоор; client `errorMessage()` + 23503/23505 кодоор найрсаг мессеж гаргадаг.

## Client хэв маягууд (src/)

- **i18n (MN/EN/ZH):** react-i18next; толь = `src/i18n/locales/{mn,en,zh}/<секц>.ts` (нэг секц = нэг домэйн, aggregator index.ts). Компонентод `useTranslation()` + `t("секц.түлхүүр")`; lib-д алдааны мессежийг **функц дотор** `i18n.t(...)` (module-level const-д хэзээ ч биш); `Record<код, нэр>` label map-уудыг `labelMap()` (src/i18n/labelMap.ts) — утга нь түлхүүр, уншилт бүрд идэвхтэй хэлээр, дуудагч талын API өөрчлөгдөхгүй. Хэл солигч header + Login (localStorage `lang`, default mn). Орчуулахгүй: DB raise exception passthrough, DB-д хадгалагддаг утга, Excel толгойн synonym, шошгон дээр хэвлэгдэх текст, динамик attribute баганын нэр, комментууд. Шинэ UI текст нэмэхдээ 3 хэлэнд зэрэг нэм (түлхүүрийн олонлог ижил байх ёстой).
- **lib/ = логик, components/ = UI.** Нэг ойлголт = нэг эх сурвалж: `epcStatus.ts` (статус код↔нэр↔badge), `transactions.ts` (TX_TYPE_LABEL...), `permissions.ts` (эрхийн каталог + makeCan), `epcHistory.ts` (EVENT_META), `format.ts` (formatMoney/parseMoney), `receiving.ts` (хүлээн авалт), `stocktake.ts` (тооллого).
- **Баталгаажуулалт ҮРГЭЛЖ `ConfirmDialog` компонентоор** — `window.confirm` ХОРИОТОЙ (Chrome чимээгүй хаадаг тул товч "ажиллахгүй" мэт болдог; 2026-07-26-нд бүгдийг сольсон).
- **Скан урсгалын хэв маяг (Хүлээн авалт + Тооллого, ирээдүйн C5 native апп ч ижил):** сервер талд idempotent scans хүснэгт (ажил+epc_hex PK — дахин илгээхэд алгасна, олон уншигч зэрэг болно) + ангилдаг RPC + progress view; клиент 500-аар багцалж илгээнэ. Тооллого hex-ээр шууд тулгана (задлахгүй — GID ч хамрагдана), хүлээн авалт `sgtin96_decode`-оор GTIN болгож тулгана. Системд бүртгэлгүй таг тооллогод огт харагдахгүй (DB-д бичигдэвч нуугдана). Системийн үүсгэх serial үйлдвэрийнхээс ХАРААТ БУС өөрийн дэсээ явна (тоолуур гадны serial-аар урагшлахгүй).
- **Тоо харуулах:** үнэ/тоо мянгатын таслалтай (`formatMoney`) — гэхдээ column `get()` ТҮҮХИЙ утга буцаана (эрэмбэ/шүүлт эвдрэхгүй), форматыг render дээр. **CSV export үргэлж түүхий тоо** (Excel-д танигдана).
- **Хүснэгтийн загвар** (ProductList/Inventory/EpcTable): ColDef массив, client-side шүүлт/эрэмбэ/хуудас (EpcTable нь server-side: `epc_full` view + `fetchEpcPage`), багана нуух localStorage, толгойн шошго тогтмол өндөр (min-h-[32px]) + баганын босоо зааг.
- **EpcTable-ийн шүүлт баганын ТӨРӨЛД тохирно** (date/тоон баганад ilike → "operator does not exist" унадаг байсан): огноо=date picker (eq), Салбар/Төлөв=select (eq), тоон (serial/price/cost)="агуулсан" — epc_full-ийн `*_text` mirror багана дээр ilike (PostgREST шүүлтэд cast дэмждэггүй; эрэмбэ тоон баганаараа). Танигдаагүй ийм алдаанд errors.badFilterValue найрсаг fallback.
- **Платформын таб (2026-07-29):** `NAV`-д БАЙХГҮЙ — App.tsx `isPlatformAdmin()` RPC-ийн хариугаар цэсний сүүлд нэмэгддэг (TAB_PERM/adminOnly-д хамаарахгүй, тенантын эрхээс тусдаа). RPC байхгүй/эрхгүй бол `false` буцаж таб нуугдана тул схем Run хийгээгүй суурьт ч эвдрэхгүй. `PlatformConsole.tsx` lazy.
- **Цэсний бүтэц (2026-07-27):** App.tsx `NAV` = дан таб + бүлэг; дээд цэс 7 (Бараа (EPC) 5 дэд табтай, Удирдлага 4 дэд табтай, Тайлан 7 дэд табтай). Бүлэг сүүлд нээсэн дэд табаа localStorage `navSub.*`-д санана; бүлгийн бүх хүүхэд эрхээр нуугдвал бүлэг нуугдана. Дэд таб бар нь ижил border-b-2 хэв маяг.
- **UI стандарт (2026-07-28, хэрэглэгчтэй тохирсон):** дээд цэс font-semibold, дэд таб энгийн; хуудас дотор ДАВТСАН том гарчиг байхгүй (таб өөрөө гарчиг) — зөвхөн жижиг саарал тайлбар текст; тайлангуудад үнэ/өртөггүй бараа 0-ээр + байгаа үед л шар анхааруулга (тусдаа багана хийхгүй).
- **Падаан (TransferNoteDialog + lib/transferNote.ts):** урьдчилан харах iframe srcDoc + body contentEditable → iframe print() — popup ХЭРЭГЛЭХГҮЙ (blocker); фонтод CJK ил заана (хятад үсэг PDF-д гарахын тулд). Товч зөвхөн гүйлгээний дэлгэрэнгүй модалд.
- **Импортын загвар:** `public/templates/packing-list-template.{mn,en,zh}.xlsx` — идэвхтэй хэлээр татагдана; толгойн synonym MN/EN/ZH; "Өртөг" багана сонголтоор (файлд байхгүй бол байгаа өртгийг ДАРДАГГҮЙ — hasCost).
- **Бөөн үйлдэл:** сонголт (Map) эсвэл шүүлтэд тохирох бүгд (`resolveRows`), 500-аар chunk, optimistic update, баталгаажуулах модал. Аудит лог: бөөн EPC үйлдэлд `epcBulkMeta(rows)` (бараагаар задаргаа + 100 hex).
- **⚠️ Lint дүрэм:** effect дотор синхрон setState хориотой (`react-hooks/set-state-in-effect`) — бүх setState-г promise/async callback дотор хий; эхний утгыг useState initializer-ээр. Мөн render дотор ref унших хориотой.
- Prop threading: `isAdmin`, `allowedBranches` (салбар scoping, null=хязгааргүй), `perms` (null=бүрэн), `refreshKey` (сэргээх дохио).
- Scan оролт: RFID уншигч гар шиг бичдэг (EPC + Enter) — `normalizeEpc` баталгаажуулна.

## Хийгдээгүй / мэдэгдэж буй хязгаарлалт

- Deploy: **https://rfid-epc.vercel.app** (Vercel team "chipmo", main push бүрт авто-deploy; заавар docs/deploy.md). Resend SMTP тохируулаагүй — built-in имэйл цагт ~2-4 хязгаартай.
- Урилга имэйл илгээдэггүй (уригдсан хүн өөрөө бүртгүүлдэг).
- Native апп (github War0maN/EpcBarcodeApp, локал `~/Projects/EpcBarcodeApp`, supabase-kt 3.5.0): Ү5 хүлээн авалт **бодит агуулахад туршигдаж баталгаажсан** (2026-07-30, 169/172 таг), Ү6 тооллогын дэлгэц мөн C5 дээр ажиллаж байгаа — 2026-08-03 бүгд **master-т нэгтгэгдсэн** (нүүр grid, уншигчийн авто-эхлэл/авто-сэргээлт, Хайлт, Профайл орсон). Мөн тооллогын дутуу мөрөөс шууд Geiger хайлт (10a149d) орсон. **Гурван тогтсон дүрэм:** тулгалтын нормчлол = `MatchEngine.key()` (GTIN-14, сервертэй ижил); хайлтын угтвар = `EpcDecoder.productPrefix()` (SGTIN 14 / GID 15 hex, серийн өмнөх хэсэг — гараар тохируулдаггүй); Compose-д дэвсгэр = үргэлж `Surface` (background() нь LocalContentColor шинэчилдэггүй). Зорилго (2026-07-30 тохирсон): бүх хөдөлгөөнийг mobile-оос хийдэг болгох — дараагийн шат = шилжүүлэг/актлалт (серверт ноорог-сагс), дараа нь борлуулалт/буцаалт.
- Тооллогын скангийн эх сурвалж ✅ (2026-08-02): `stocktake_scans.source` ('manual'=веб, 'device'=C5), `stocktake_scan` RPC 3 параметрт (хуучин 2-параметртыг drop хийсэн — default-тай зэрэгцвэл PostgREST ambiguous). Тайланд ялгаж харуулах UI хараахан алга — дата хуримтлагдаж байгаа.
- Аудит дахь гүйлгээний мөр `actionMeta()`-ээр жинхэнэ үйлдлээ харуулна (Борлуулалт/Шилжүүлэг хүлээн авсан г.м.) — audit_transactions trigger-ийн түүхий insert/update-ыг харагдацад нь хөрвүүлдэг, DB хэвээр.
