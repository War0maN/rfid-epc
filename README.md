# Chipmo Inventory

Импортын барааны packing list-ээс GS1 стандартын **RFID EPC** (SGTIN-96 / GID-96) код үүсгэж, шошго хэвлэж, барааны бүрэн амьдралын мөчлөгийг (үлдэгдэл · борлуулалт · шилжүүлэг · буцаалт · тайлан) ширхэг бүрээр нь мөрддөг **олон компанийн (multi-tenant)** веб систем.

## Гол боломжууд

- **EPC үүсгэлт** — баркодтой бараанд SGTIN-96, баркодгүйд GID-96; serial хэзээ ч давтагдахгүй (атом serial counter)
- **Excel импорт** — packing list-ээс бараа/ангилал/шинж чанар автоматаар бүртгэж EPC бөөнөөр үүсгэнэ
- **Шошго хэвлэлт** — Zebra Browser Print (ZPL), шошгоны дизайнер
- **Төлөвийн мөчлөг** — Хэвлээгүй → Идэвхтэй → Борлуулсан / Шилжүүлж буй / Бусад гүйлгээ (+ Буцаалт)
- **Үлдэгдэл** — бараа × салбар матриц, идэвхтэй EPC-ийн тоо + үнийн дүн
- **Гүйлгээ** — UNIQLO маягийн скан→сагс урсгал; 2 алхамт шилжүүлэг; буцаалт
- **EPC түүх** — ширхэг бүрийн бүрэн timeline (хэн/хэзээ/хаана/яагаад), append-only event log
- **Тайлан** — борлуулалт (өдөр/сар/салбар/бараа/хэрэглэгчээр), график, CSV
- **Эрхийн систем** — салбарын scoping (RLS) + таб/үйлдлийн нарийвчилсан эрх, бүгд DB түвшинд хамгаалагдсан
- **Аудит** — бүх өөрчлөлт хэн/хэзээ/юуг дэлгэрэнгүйтэйгээ

## Технологи

Vite · React 19 · TypeScript · Tailwind CSS · Supabase (Postgres + RLS + Auth) · recharts · Zebra Browser Print

## Суулгах

```bash
git clone https://github.com/War0maN/rfid-epc.git
cd rfid-epc
npm install
```

1. [Supabase](https://supabase.com) дээр төсөл үүсгэнэ.
2. `.env.example`-ийг `.env` болгож хуулаад Supabase-ийн утгуудыг бөглөнө:
   ```
   VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-public-key
   ```
3. Supabase **SQL Editor** дээр [`docs/schema.sql`](docs/schema.sql)-ийг бүхэлд нь Run хийнэ (idempotent — дахин Run хийхэд аюулгүй; схем өөрчлөгдөх бүрт дахин Run хийдэг).

## Ажиллуулах

```bash
npm run dev      # http://localhost:5173
npm run build    # tsc + vite build
npm run lint
```

Анхны хэрэглэгч бүртгүүлээд байгууллагаа үүсгэхэд **админ** болно; бусдыг Хэрэглэгчид табаас имэйлээр урина (уригдсан хүн тэр имэйлээрээ бүртгүүлэхэд автоматаар нэгдэнэ).

## Бүтэц

```
docs/
  schema.sql          # DB-ийн бүрэн эх сурвалж (Supabase дээр Run хийнэ)
  architecture.md     # Системийн архитектур, ойлголт, зарчмууд
  user-guide.md       # Хэрэглэгчийн гарын авлага (таб бүрээр)
  printing-plan.md    # Хэвлэлтийн төлөвлөгөө
src/
  lib/                # Бизнес логик (epc, гүйлгээ, эрх, түүх, формат...)
  components/         # Таб бүрийн UI компонентууд
CLAUDE.md             # Кодын архитектур, тогтсон зарчмууд (хөгжүүлэгч/AI-д)
```

Дэлгэрэнгүй: [Архитектур](docs/architecture.md) · [Хэрэглэгчийн гарын авлага](docs/user-guide.md)
