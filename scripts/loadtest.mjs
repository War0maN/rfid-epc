// Ачааллын тест — вебийн жинхэнэ query хэлбэрүүдийг (epc_full server-side
// хуудаслалт, ерөнхий .or ilike хайлт, баганын шүүлт, тоолол, products_full)
// нэвтэрсэн хэрэглэгчийн эрхээр (RLS үйлчилнэ) N удаа ажиллуулж p50/p95
// хугацааг хэмжинэ. Эхлээд scripts/loadtest-seed.sql-ийг SQL Editor-т Run.
//
// Хэрэглээ:
//   LT_EMAIL=you@company.com LT_PASSWORD=... node scripts/loadtest.mjs
// URL/түлхүүр: орчны хувьсагч эсвэл .env(.local)-ын VITE_SUPABASE_URL /
// VITE_SUPABASE_ANON_KEY. Нэмэлт: LT_ITER (default 10).

import { readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { createClient } from "@supabase/supabase-js";

// ── .env(.local) уншигч (dotenv хамааралгүй, энгийн KEY=VALUE) ──
function loadDotenv(path) {
  try {
    for (const line of readFileSync(path, "utf8").split("\n")) {
      const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
      }
    }
  } catch {
    /* файл байхгүй бол алгасна */
  }
}
loadDotenv(new URL("../.env.local", import.meta.url).pathname);
loadDotenv(new URL("../.env", import.meta.url).pathname);

const URL_ = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;
const EMAIL = process.env.LT_EMAIL;
const PASSWORD = process.env.LT_PASSWORD;
const ITER = Math.max(3, parseInt(process.env.LT_ITER || "10", 10) || 10);

if (!URL_ || !KEY || !EMAIL || !PASSWORD) {
  console.error(
    "Дутуу тохиргоо. Шаардлагатай: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (.env/.env.local-оос ч болно), LT_EMAIL, LT_PASSWORD."
  );
  process.exit(1);
}

const supabase = createClient(URL_, KEY, { auth: { persistSession: false } });

// Вебийн EPC_SEARCH_COLS (src/lib/queries.ts)-тай ижил байлга.
const SEARCH_COLS = [
  "epc_hex", "name", "sku", "gtin", "branch_name", "job_number",
  "supplier", "box_no", "attributes_text", "category_l1", "category_l2", "category_l3",
];
const orSearch = (s) => SEARCH_COLS.map((c) => `${c}.ilike.%${s}%`).join(",");

/** epc_full хуудасны суурь query — fetchEpcPageGlobal-тай ижил эрэмбэ. */
function epcPage({ page = 1, pageSize = 25, search = "", status = "", nameLike = "", sortBy = "", sortOrder = "desc" } = {}) {
  let q = supabase.from("epc_full").select("*", { count: "exact" });
  if (search) q = q.or(orSearch(search));
  if (status) q = q.eq("status", status);
  if (nameLike) q = q.ilike("name", `%${nameLike}%`);
  q = sortBy
    ? q.order(sortBy, { ascending: sortOrder === "asc" })
    : q.order("created_at", { ascending: false }).order("serial", { ascending: true });
  q = q.order("id", { ascending: true });
  const from = (page - 1) * pageSize;
  return q.range(from, from + pageSize - 1);
}

const SCENARIOS = [
  ["EPC хуудас 1 (25 мөр + count)", () => epcPage()],
  ["EPC хуудас 100 (гүн offset)", () => epcPage({ page: 100 })],
  ["EPC ерөнхий хайлт (.or ilike ×12)", () => epcPage({ search: "LT бараа 01" })],
  ["EPC төлөвийн шүүлт (status=active)", () => epcPage({ status: "active" })],
  ["EPC нэрийн ilike шүүлт", () => epcPage({ nameLike: "LT бараа 042" })],
  ["EPC эрэмбэ serial desc", () => epcPage({ sortBy: "serial", sortOrder: "desc" })],
  ["EPC зөвхөн count", () => supabase.from("epc_full").select("id", { count: "exact", head: true })],
  ["Бүтээгдэхүүн (products_full бүгд)", () => supabase.from("products_full").select("*")],
  ["Гүйлгээ (сүүлийн 500)", () =>
    supabase.from("transactions").select("*").order("created_at", { ascending: false }).limit(500)],
];

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const ms = (v) => `${v.toFixed(0)} ms`;

async function main() {
  const t0 = performance.now();
  const { error: authErr } = await supabase.auth.signInWithPassword({ email: EMAIL, password: PASSWORD });
  if (authErr) {
    console.error("Нэвтрэлт амжилтгүй:", authErr.message);
    process.exit(1);
  }
  console.log(`Нэвтрэв (${ms(performance.now() - t0)}) — ${URL_}`);

  // Seed-ийн хэмжээг харуулна (ADED% = LT EPC).
  const { count: ltCount } = await supabase
    .from("epc_full").select("id", { count: "exact", head: true }).ilike("epc_hex", "ADED%");
  const { count: allCount } = await supabase
    .from("epc_full").select("id", { count: "exact", head: true });
  console.log(`EPC нийт: ${allCount ?? "?"} (үүнээс LT seed: ${ltCount ?? "?"}) · давталт: ${ITER}\n`);
  if (!ltCount) console.log("⚠ LT seed олдсонгүй — эхлээд scripts/loadtest-seed.sql-ийг Run хийсэн үү?\n");

  const results = [];
  for (const [name, build] of SCENARIOS) {
    // Бэлтгэл халаалт (кэш/холболт) — хэмжилтэд оруулахгүй.
    await build();
    const times = [];
    let rows = 0;
    let total = null;
    let failed = null;
    for (let i = 0; i < ITER; i++) {
      const s = performance.now();
      const { data, count, error } = await build();
      times.push(performance.now() - s);
      if (error) {
        failed = error.message;
        break;
      }
      rows = data?.length ?? 0;
      if (count != null) total = count;
    }
    if (failed) {
      console.log(`✗ ${name} — АЛДАА: ${failed}`);
      results.push({ name, failed });
      continue;
    }
    const r = { name, p50: pct(times, 50), p95: pct(times, 95), min: Math.min(...times), max: Math.max(...times), rows, total };
    results.push(r);
    console.log(
      `✓ ${name}\n    p50 ${ms(r.p50)} · p95 ${ms(r.p95)} · min ${ms(r.min)} · max ${ms(r.max)}` +
        ` · мөр ${rows}${total != null ? ` · нийт ${total}` : ""}`
    );
  }

  console.log("\n── Нэгтгэл (p50 / p95) ──");
  for (const r of results) {
    console.log(r.failed ? `${r.name}: АЛДАА` : `${r.name}: ${ms(r.p50)} / ${ms(r.p95)}`);
  }
  await supabase.auth.signOut();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
