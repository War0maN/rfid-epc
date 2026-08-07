// Ачааллын тест — вебийн жинхэнэ query хэлбэрүүдийг (epc_full server-side
// хуудаслалт, ерөнхий .or ilike хайлт, баганын шүүлт, тоолол, products_full,
// Үлдэгдэл, Тайлангийн RPC-ууд, Аудит) нэвтэрсэн хэрэглэгчийн эрхээр
// (RLS/эрх/салбарын scoping автоматаар үйлчилнэ) N удаа ажиллуулж p50/p95
// хугацааг хэмжинэ. Эхлээд scripts/loadtest-seed.sql-ийг SQL Editor-т Run.
//
// Хэрэглээ (нэг хэрэглэгч):
//   LT_EMAIL=admin@... LT_PASSWORD=... node scripts/loadtest.mjs
// Хоёр хэрэглэгчийг зэрэг харьцуулах (жишээ нь админ vs оператор):
//   LT_EMAIL=admin@... LT_PASSWORD=... \
//   LT_EMAIL2=operator@... LT_PASSWORD2=... node scripts/loadtest.mjs
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
const ITER = Math.max(3, parseInt(process.env.LT_ITER || "10", 10) || 10);

/** Хэмжих хэрэглэгчид: LT_EMAIL(2)/LT_PASSWORD(2). Хоёр дахь нь сонголтоор. */
const ACCOUNTS = [
  { label: process.env.LT_LABEL || "1-р хэрэглэгч", email: process.env.LT_EMAIL, password: process.env.LT_PASSWORD },
  { label: process.env.LT_LABEL2 || "2-р хэрэглэгч", email: process.env.LT_EMAIL2, password: process.env.LT_PASSWORD2 },
].filter((a) => a.email && a.password);

if (!URL_ || !KEY || ACCOUNTS.length === 0) {
  console.error(
    "Дутуу тохиргоо. Шаардлагатай: VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY (.env/.env.local-оос ч болно), LT_EMAIL, LT_PASSWORD."
  );
  process.exit(1);
}

// Вебийн EPC_SEARCH_COLS (src/lib/queries.ts)-тай ижил байлга.
const SEARCH_COLS = [
  "epc_hex", "name", "sku", "gtin", "branch_name", "job_number",
  "supplier", "box_no", "attributes_text", "category_l1", "category_l2", "category_l3",
];
const orSearch = (s) => SEARCH_COLS.map((c) => `${c}.ilike.%${s}%`).join(",");

/** Тайлангийн интервал — сүүлийн 90 хоног (өнөөдрийг оруулаад). */
function dateRange(days = 90) {
  const to = new Date();
  const from = new Date(to.getTime() - days * 86400000);
  const iso = (d) => d.toISOString().slice(0, 10);
  return { from: iso(from), to: iso(to) };
}
const RANGE = dateRange();

/** Нэг хэрэглэгчийн client дээрх бүх хувилбарууд (вебийн жинхэнэ query-ууд). */
function scenariosFor(sb) {
  const epcPage = ({ page = 1, pageSize = 25, search = "", status = "", nameLike = "", sortBy = "", sortOrder = "desc" } = {}) => {
    let q = sb.from("epc_full").select("*", { count: "exact" });
    if (search) q = q.or(orSearch(search));
    if (status) q = q.eq("status", status);
    if (nameLike) q = q.ilike("name", `%${nameLike}%`);
    q = sortBy
      ? q.order(sortBy, { ascending: sortOrder === "asc" })
      : q.order("created_at", { ascending: false }).order("serial", { ascending: true });
    q = q.order("id", { ascending: true });
    const from = (page - 1) * pageSize;
    return q.range(from, from + pageSize - 1);
  };

  /**
   * Шинэ ХОЁР АЛХАМТ хайлт (lib/queries.ts-тэй ижил логик): эхлээд жижиг
   * хүснэгтээс id → дараа нь epc_full-ийг id-аар. product_search view
   * (schema.sql) шаардлагатай — байхгүй бол алдаа гарч харагдана.
   */
  const twoStepSearch = async (s) => {
    const like = `%${s}%`;
    const [prod, job, br] = await Promise.all([
      sb.from("product_search").select("id")
        .or(["name", "sku", "gtin", "category_l1", "category_l2", "category_l3", "attributes_text"]
          .map((c) => `${c}.ilike.${like}`).join(","))
        .limit(201),
      sb.from("jobs").select("id").or(`job_number.ilike.${like},supplier.ilike.${like}`).limit(201),
      sb.from("branches").select("id").ilike("name", like).limit(201),
    ]);
    if (prod.error) return prod;
    const clauses = [`epc_hex.ilike.${like}`, `box_no.ilike.${like}`];
    const ids = (r) => (r.data ?? []).map((x) => x.id);
    if (ids(prod).length) clauses.push(`product_id.in.(${ids(prod).join(",")})`);
    if (!job.error && ids(job).length) clauses.push(`job_id.in.(${ids(job).join(",")})`);
    if (!br.error && ids(br).length) clauses.push(`branch_id.in.(${ids(br).join(",")})`);
    return sb.from("epc_full").select("*", { count: "exact" })
      .or(clauses.join(","))
      .order("created_at", { ascending: false })
      .order("serial", { ascending: true })
      .order("id", { ascending: true })
      .range(0, 24);
  };

  return [
    // ── EPC жагсаалт (server-side хуудаслалт) ──
    ["EPC хуудас 1 (25 мөр + count)", () => epcPage()],
    ["EPC хуудас 100 (гүн offset)", () => epcPage({ page: 100 })],
    ["EPC хайлт ХУУЧИН (.or ilike ×12)", () => epcPage({ search: "LT бараа 01" })],
    ["EPC хайлт ШИНЭ (2 алхам)", () => twoStepSearch("LT бараа 01")],
    ["EPC төлөвийн шүүлт (status=active)", () => epcPage({ status: "active" })],
    ["EPC нэрийн ilike шүүлт", () => epcPage({ nameLike: "LT бараа 042" })],
    ["EPC эрэмбэ serial desc", () => epcPage({ sortBy: "serial", sortOrder: "desc" })],
    ["EPC хуудас 250 мөр", () => epcPage({ pageSize: 250 })],
    ["EPC зөвхөн count", () => sb.from("epc_full").select("id", { count: "exact", head: true })],
    // ── Бусад жагсаалтууд ──
    ["Бүтээгдэхүүн (products_full бүгд)", () => sb.from("products_full").select("*")],
    ["Үлдэгдэл (stock_by_branch)", () => sb.from("stock_by_branch").select("product_id, branch_id, qty")],
    ["Гүйлгээ (сүүлийн 500)", () =>
      sb.from("transactions").select("*").order("created_at", { ascending: false }).limit(500)],
    ["Аудит лог (сүүлийн 200)", () =>
      sb.from("audit_log").select("id, actor_id, action, entity, entity_id, meta, created_at")
        .order("created_at", { ascending: false }).limit(200)],
    // ── Тайлангийн RPC-ууд (security invoker — RLS/эрх дотор нь үйлчилнэ) ──
    ["Тайлан: Борлуулалт (report_sales 90 хоног)", () => sb.rpc("report_sales", { p_from: RANGE.from, p_to: RANGE.to })],
    ["Тайлан: Орлого (report_inflow 90 хоног)", () => sb.rpc("report_inflow", { p_from: RANGE.from, p_to: RANGE.to })],
    ["Тайлан: Хөдөлгөөн (report_movement 90 хоног)", () => sb.rpc("report_movement", { p_from: RANGE.from, p_to: RANGE.to })],
    ["Тайлан: Тооллого (report_stocktake 90 хоног)", () => sb.rpc("report_stocktake", { p_from: RANGE.from, p_to: RANGE.to })],
  ];
}

const pct = (arr, p) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};
const ms = (v) => `${v.toFixed(0)} ms`;
const pad = (s, n) => (s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length));

/** Нэг хэрэглэгчээр бүх хувилбарыг хэмжинэ. */
async function runFor(account) {
  const sb = createClient(URL_, KEY, { auth: { persistSession: false } });
  const t0 = performance.now();
  const { error: authErr } = await sb.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (authErr) {
    console.error(`✗ ${account.label} (${account.email}) нэвтэрч чадсангүй: ${authErr.message}`);
    return null;
  }
  console.log(`\n═══ ${account.label}: ${account.email} — нэвтрэв (${ms(performance.now() - t0)}) ═══`);

  // Хэрэглэгчийн харагдац: нийт EPC + LT seed (эрх/салбарын scoping-ийн нөлөө ил гарна).
  const { count: allCount } = await sb.from("epc_full").select("id", { count: "exact", head: true });
  const { count: ltCount } = await sb
    .from("epc_full").select("id", { count: "exact", head: true }).ilike("epc_hex", "ADED%");
  console.log(`Харагдах EPC: ${allCount ?? "?"} (үүнээс LT seed: ${ltCount ?? "?"}) · давталт: ${ITER}`);
  if (!ltCount) console.log("⚠ LT seed харагдахгүй байна — seed Run хийсэн үү, эсвэл энэ хэрэглэгчид эрх/салбар хаагдсан уу?");

  const results = [];
  for (const [name, build] of scenariosFor(sb)) {
    await build(); // халаалт — хэмжилтэд оруулахгүй
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
    const r = {
      name,
      p50: pct(times, 50),
      p95: pct(times, 95),
      min: Math.min(...times),
      max: Math.max(...times),
      rows,
      total,
    };
    results.push(r);
    console.log(
      `✓ ${pad(name, 44)} p50 ${pad(ms(r.p50), 8)} p95 ${pad(ms(r.p95), 8)}` +
        ` мөр ${rows}${total != null ? ` · нийт ${total}` : ""}`
    );
  }
  await sb.auth.signOut();
  return { account, results };
}

async function main() {
  console.log(`Ачааллын тест — ${URL_}`);
  console.log(`Тайлангийн интервал: ${RANGE.from} … ${RANGE.to}`);

  const runs = [];
  for (const acc of ACCOUNTS) {
    const r = await runFor(acc);
    if (r) runs.push(r);
  }
  if (runs.length === 0) process.exit(1);

  // ── Нэгтгэл: хэрэглэгч бүрийн p50/p95 зэрэгцүүлж ──
  console.log("\n══════════ НЭГТГЭЛ (p50 / p95) ══════════");
  const header = pad("Хувилбар", 44) + runs.map((r) => pad(r.account.label, 26)).join("");
  console.log(header);
  console.log("─".repeat(header.length));
  const names = runs[0].results.map((r) => r.name);
  for (const name of names) {
    const cells = runs.map((run) => {
      const r = run.results.find((x) => x.name === name);
      if (!r) return pad("—", 26);
      return pad(r.failed ? "АЛДАА" : `${ms(r.p50)} / ${ms(r.p95)}`, 26);
    });
    console.log(pad(name, 44) + cells.join(""));
  }

  // Хамгийн удаан 5 (эхний хэрэглэгчээр).
  const slow = runs[0].results.filter((r) => !r.failed).sort((a, b) => b.p95 - a.p95).slice(0, 5);
  console.log(`\nХамгийн удаан 5 (${runs[0].account.label}, p95-аар):`);
  for (const r of slow) console.log(`  ${pad(r.name, 44)} ${ms(r.p95)}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
