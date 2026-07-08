# CLAUDE.md — Кодын архитектур ба тогтсон зарчмууд

RFID EPC Generator: Vite + React 19 + TS + Tailwind + Supabase (Postgres/RLS/Auth), multi-tenant, **UI бүхэлдээ Монгол хэлээр**. Дэлгэрэнгүй ойлголтууд: `docs/architecture.md`.

## Ажлын урсгал

- Схемийн эх сурвалж = `docs/schema.sql` (migration-style, **idempotent**). Схем өөрчилбөл хэрэглэгч Supabase SQL Editor дээр файлыг бүхэлд нь дахин Run хийнэ — үүнийг өөрчлөлт бүрт сануул.
- Git: feature branch → хэрэглэгч гараар туршина → commit → `main`-д **зөвхөн fast-forward** merge → GitHub push. Commit-ийн өмнө `npx tsc -b` + eslint заавал цэвэр.
- Туршилт: `npm run dev` (localhost:5173/5174), хэрэглэгч UI-гаас туршиж баталгаажуулдаг.

## Халдашгүй зарчмууд

1. **Устгалын зарчим (хатуу RESTRICT, доороос дээш):** түүхэн дата хэзээ ч устгагдахгүй. Гүйлгээ (`transactions`) устгах DELETE policy огт байхгүй. EPC: Борлуулсан/Шилжүүлж буй/Бусад гүйлгээт `epc_block_active_delete` trigger-ээр, гүйлгээний түүхтэй нь `transaction_items` FK (RESTRICT)-ээр хамгаалагдана. Шинэ FK-д default (RESTRICT) ашигла; cascade зөвхөн "хамт үүсдэг, хамт устах нь зөв" зүйлд (job→unprinted epc, epc→events).
2. **Залруулга = устгал биш, сөрөг үйлдэл:** буцаалт (return гүйлгээ), шилжүүлэг цуцлах, гараар төлөв солих (тэмдэглэлтэй, түүхэнд бичигдэнэ).
3. **Бүх бичилт хамгаалалттай 2 давхаргатай:** UI нуух нь зөвхөн ая тух; жинхэнэ хориг DB талд (RLS policy эсвэл RPC доторх шалгалт).

## DB хэв маягууд (schema.sql)

- **Атом олон бичилт = security definer RPC** (`create_transaction`, `receive_transfer`, `cancel_transfer`, `change_epc_status`, `set_member_branches`, `set_member_perms`). Security definer нь RLS-ийг ТОЙРДОГ тул тенант/салбар/эрхийн шалгалтыг RPC дотор заавал хий.
- **RPC↔trigger холбоо transaction-local тохиргоогоор:** `set_config('app.tx_rpc'|'app.tx_id'|'app.reason', ..., true)` — guard trigger давах эрх, event-ийг гүйлгээтэй холбох, тэмдэглэл дамжуулах.
- **⚠️ RLS гүйцэтгэлийн сургамж:** policy дотор security definer функцийг мөр бүрд дуудаж БОЛОХГҮЙ (20k мөрөнд statement timeout болсон). Оронд нь нэг удаа тооцогдох хэлбэр: `(select is_tenant_admin())`, `(select has_perm('...'))` (InitPlan) + `col in (select ... from user_branches ...)` (hashed subplan).
- **Event log:** `epc_events` append-only; `epc_codes`-ийн insert/update trigger автоматаар бичдэг тул кодын аль ч зам мартагдахгүй. Шинэ статус шилжилт нэмбэл trigger-ийн case-д нэм.
- **Үнэ snapshot:** гүйлгээний үед `transaction_items.price`-д хадгална (тайлан үүн дээр).
- **"Хоосон тохиргоо = хязгааргүй" семантик:** `user_branches`/`user_permissions`-д мөргүй хэрэглэгч бүрэн эрхтэй (default, backward compatible); админ үргэлж бүрэн.
- View-үүд `security_invoker = true` тул RLS автоматаар үйлчилнэ — scoping нэмэхэд view өөрчлөх шаардлага ихэвчлэн гардаггүй.
- DB-ийн raise exception мессежүүд Монголоор; client `errorMessage()` + 23503/23505 кодоор найрсаг мессеж гаргадаг.

## Client хэв маягууд (src/)

- **lib/ = логик, components/ = UI.** Нэг ойлголт = нэг эх сурвалж: `epcStatus.ts` (статус код↔нэр↔badge), `transactions.ts` (TX_TYPE_LABEL...), `permissions.ts` (эрхийн каталог + makeCan), `epcHistory.ts` (EVENT_META), `format.ts` (formatMoney/parseMoney).
- **Тоо харуулах:** үнэ/тоо мянгатын таслалтай (`formatMoney`) — гэхдээ column `get()` ТҮҮХИЙ утга буцаана (эрэмбэ/шүүлт эвдрэхгүй), форматыг render дээр. **CSV export үргэлж түүхий тоо** (Excel-д танигдана).
- **Хүснэгтийн загвар** (ProductList/Inventory/EpcTable): ColDef массив, client-side шүүлт/эрэмбэ/хуудас (EpcTable нь server-side: `epc_full` view + `fetchEpcPage`), багана нуух localStorage, толгойн шошго тогтмол өндөр (min-h-[32px]) + баганын босоо зааг.
- **Дэд таб хэв маяг:** App.tsx (Бүтээгдэхүүн=жагсаалт/ангилал, Бараа(EPC)=жагсаалт/хайлт), Transactions (гүйлгээ/түүх) — ижил border-b-2 таб бар.
- **Бөөн үйлдэл:** сонголт (Map) эсвэл шүүлтэд тохирох бүгд (`resolveRows`), 500-аар chunk, optimistic update, баталгаажуулах модал. Аудит лог: бөөн EPC үйлдэлд `epcBulkMeta(rows)` (бараагаар задаргаа + 100 hex).
- **⚠️ Lint дүрэм:** effect дотор синхрон setState хориотой (`react-hooks/set-state-in-effect`) — бүх setState-г promise/async callback дотор хий; эхний утгыг useState initializer-ээр. Мөн render дотор ref унших хориотой.
- Prop threading: `isAdmin`, `allowedBranches` (салбар scoping, null=хязгааргүй), `perms` (null=бүрэн), `refreshKey` (сэргээх дохио).
- Scan оролт: RFID уншигч гар шиг бичдэг (EPC + Enter) — `normalizeEpc` баталгаажуулна.

## Хийгдээгүй / мэдэгдэж буй хязгаарлалт

- i18n (MN/EN/ZH) төлөвлөгдсөн — одоогоор бүх текст Монгол hardcode.
- Урилга имэйл илгээдэггүй (уригдсан хүн өөрөө бүртгүүлдэг); deploy хийгдээгүй (localhost).
- Тайлан буцаалтыг хасдаггүй (буцаагдаад дахин зарагдвал 2 тоологдоно).
- Тооллого (stocktake) хийгдээгүй.
