# Deploy (Vercel) + Имэйл (Resend SMTP) заавар

Зорилго: аппыг интернэтэд гаргаж (Chainway C5 болон дурын төхөөрөмжөөс хандах),
нууц үг сэргээх зэрэг имэйлийг найдвартай илгээдэг болгох.

## 1. Vercel дээр deploy хийх (GitHub import — зөвлөх зам)

Push бүрт автоматаар шинэчлэгддэг тул CLI шаардлагагүй.

1. https://vercel.com → **Sign Up / Log In** → **Continue with GitHub** (War0maN бүртгэлээрээ).
2. **Add New… → Project** → жагсаалтаас **War0maN/rfid-epc** сонгож **Import**.
   (Харагдахгүй бол "Adjust GitHub App Permissions"-оор repo-д эрх өгнө.)
3. Framework: **Vite** гэж автоматаар танина (`vercel.json`-д заасан). Build тохиргоог өөрчлөх шаардлагагүй.
4. **Environment Variables** хэсэгт 2 хувьсагч нэмнэ (утгыг локал `.env` файлаасаа хуулна):
   - `VITE_SUPABASE_URL` = https://YOUR-PROJECT.supabase.co
   - `VITE_SUPABASE_ANON_KEY` = anon public түлхүүр
5. **Deploy** дар. 1-2 минутад `https://<нэр>.vercel.app` хаяг гарна.
6. Шалгах: тэр хаягаар орж нэвтэрч, аль нэг таб нээгдэж байгааг үзнэ.

Үүнээс хойш: `main` руу push хийгдэх бүрт Vercel автоматаар шинэ хувилбар гаргана.

## 2. Supabase Auth URL тохиргоо (нууц үг сэргээх ажиллахад заавал)

Supabase Dashboard → **Authentication → URL Configuration**:

- **Site URL**: `https://<нэр>.vercel.app`
- **Redirect URLs** дээр нэмэх:
  - `https://<нэр>.vercel.app`
  - `http://localhost:5173` (локал хөгжүүлэлт хэвээр ажиллахын тулд)
  - `http://localhost:5174`

Апп нь reset холбоосыг `window.location.origin` руу буцаадаг тул хоёр орчин
хоёулаа жагсаалтад байвал хангалттай.

## 3. Resend SMTP (имэйлийн цагийн хязгаараас салах)

Supabase-ийн үндсэн имэйл нь цагт ~2-4 имэйлийн хязгаартай — туршилтад л зориулагдсан.

1. https://resend.com → бүртгүүлнэ (үнэгүй: өдөрт 100, сард 3000 имэйл).
2. Домэйнгүй бол эхлээд Resend-ийн туршилтын хаягаар (onboarding@resend.dev) явж болно;
   өөрийн домэйнтэй бол **Domains → Add Domain** хийж DNS бичлэгүүдийг нь тавина
   (өөрийн домэйноос илгээвэл spam-д орох магадлал багасна).
3. **API Keys → Create API Key** → түлхүүрээ хуулж авна.
4. Supabase Dashboard → **Authentication → Emails → SMTP Settings** → **Enable Custom SMTP**:
   - Host: `smtp.resend.com`
   - Port: `465`
   - Username: `resend`
   - Password: (Resend API түлхүүр)
   - Sender email: баталгаажуулсан хаяг (жишээ: `noreply@тань-домэйн` эсвэл туршилтын хаяг)
   - Sender name: `Chipmo Inventory`
5. Шалгах: Login дэлгэцээс "Нууц үгээ мартсан уу?" дарж имэйл ирж буйг үзнэ.

## 4. Тэмдэглэл

- **Zebra Browser Print** (шууд хэвлэх) нь хэвлэгчтэй компьютер дээр Browser Print
  suite суусан байхыг шаарддаг — deploy-оос хамаарахгүй, хэвлэдэг компьютер бүр дээр
  локал суулгасан хэвээр байна. SDK-ийн js файл (`public/BrowserPrint-*.min.js`)
  repo-д байгаа тул deploy-д автоматаар орно.
- Схем өөрчлөгдөх бүрт `docs/schema.sql`-ийг Supabase SQL Editor дээр Run хийх
  дүрэм хэвээр (deploy үүнд хамаагүй).
- C5 төхөөрөмж дээр: Chrome нээгээд vercel хаягаар орж нэвтэрнэ.
