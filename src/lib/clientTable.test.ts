import { describe, expect, it } from "vitest";
import { clientPage, clientFetchResult, localDateStr, type ClientTableOpts, type ClientPageParams } from "./clientTable";

interface R {
  id: string;
  name: string | null;
  qty: number;
  price: number | null;
  created_at: string;
}

const rows: R[] = [
  { id: "a", name: "Цамц", qty: 5, price: 1000, created_at: "2026-08-01T10:00:00+08:00" },
  { id: "b", name: "Өмд", qty: 12, price: null, created_at: "2026-08-02T10:00:00+08:00" },
  { id: "c", name: "Малгай", qty: 2, price: 500, created_at: "2026-08-03T10:00:00+08:00" },
  { id: "d", name: null, qty: 30, price: 200, created_at: "2026-08-04T10:00:00+08:00" },
];

const opts: ClientTableOpts<R> = {
  searchValues: (r) => [r.name, r.id],
  sorters: {
    name: (r) => r.name,
    qty: (r) => r.qty,
    price: (r) => r.price,
    created_at: (r) => r.created_at,
  },
  filterValues: { name: (r) => r.name, qty: (r) => r.qty },
  dateValue: (r) => r.created_at,
};

const base: ClientPageParams = {
  page: 1,
  limit: 25,
  search: "",
  from_date: "",
  to_date: "",
  sort_by: "",
  sort_order: "desc",
};

describe("clientPage", () => {
  it("хайлт — том/жижиг ялгахгүй, аль нэг талбарт агуулсан", () => {
    const r = clientPage(rows, { ...base, search: "цамц" }, opts);
    expect(r.rows.map((x) => x.id)).toEqual(["a"]);
    expect(r.total).toBe(1);
  });

  it("хоосон хайлт бүгдийг буцаана", () => {
    expect(clientPage(rows, base, opts).total).toBe(4);
  });

  it("тоон эрэмбэ — тоогоор (текстээр биш)", () => {
    const r = clientPage(rows, { ...base, sort_by: "qty", sort_order: "asc" }, opts);
    expect(r.rows.map((x) => x.qty)).toEqual([2, 5, 12, 30]);
  });

  it("null утга чиглэлээс үл хамааран сүүлд", () => {
    const asc = clientPage(rows, { ...base, sort_by: "price", sort_order: "asc" }, opts);
    expect(asc.rows.map((x) => x.id)).toEqual(["d", "c", "a", "b"]);
    const desc = clientPage(rows, { ...base, sort_by: "price", sort_order: "desc" }, opts);
    expect(desc.rows.map((x) => x.id)).toEqual(["a", "c", "d", "b"]);
  });

  it("баганын шүүлт — агуулсан, тоон утга ч текстээр", () => {
    const r = clientPage(rows, base, opts, { qty: "1" });
    expect(r.rows.map((x) => x.id)).toEqual(["b"]); // 12 л "1" агуулна... (5,2,30 үгүй)
  });

  it("огнооны интервал — локал огноогоор, хязгаар багтана", () => {
    const from = localDateStr("2026-08-02T10:00:00+08:00");
    const to = localDateStr("2026-08-03T10:00:00+08:00");
    const r = clientPage(rows, { ...base, from_date: from, to_date: to }, opts);
    expect(r.rows.map((x) => x.id)).toEqual(["b", "c"]);
  });

  it("хуудаслалт — хязгаараас хэтэрсэн хуудас сүүлийнхэд тогтоно", () => {
    const r = clientPage(rows, { ...base, page: 99, limit: 3 }, opts);
    expect(r.page).toBe(2);
    expect(r.rows.length).toBe(1);
    expect(r.totalPages).toBe(2);
  });

  it("эх массивыг өөрчлөхгүй (эрэмбэ хуулбар дээр)", () => {
    const before = rows.map((x) => x.id).join();
    clientPage(rows, { ...base, sort_by: "qty", sort_order: "asc" }, opts);
    expect(rows.map((x) => x.id).join()).toBe(before);
  });
});

describe("clientFetchResult", () => {
  it("tnks DataFetchResult бүтэцтэй", () => {
    const r = clientFetchResult(rows, { ...base, limit: 2 }, opts);
    expect(r.success).toBe(true);
    expect(r.data.length).toBe(2);
    expect(r.pagination).toEqual({ page: 1, limit: 2, total_pages: 2, total_items: 4 });
  });
});
