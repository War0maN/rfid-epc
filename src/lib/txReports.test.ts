// ============================================================
// Шилжүүлэг/Актлалтын тайлангийн бүлэглэлт (client талд, гүйлгээний
// snapshot үнэ дээр). keyOf нь дуудагч талаас ирдэг тул түвшин бүрийг
// (чиглэл/сар/төлөв/шалтгаан) ижил функцээр бүлэглэнэ.
// ============================================================
import { describe, it, expect } from "vitest";
import { groupTx, type TxReportRow } from "./txReports";

const tx = (over: Partial<TxReportRow> & { id: string }): TxReportRow => ({
  tx_number: "TRF-0001",
  status: "done",
  from_branch: "b1",
  to_branch: "b2",
  from_name: "Төв",
  to_name: "Салбар 2",
  created_at: "2026-03-01T00:00:00Z",
  completed_at: null,
  created_by_email: "a@b.mn",
  note: null,
  qty: 0,
  value: 0,
  noPriceQty: 0,
  ...over,
});

const byDirection = (r: TxReportRow) => ({
  key: `${r.from_name}→${r.to_name}`,
  label: `${r.from_name} → ${r.to_name}`,
});
const byMonth = (r: TxReportRow) => ({ key: r.created_at.slice(0, 7), label: r.created_at.slice(0, 7) });

describe("groupTx", () => {
  it("гүйлгээний тоо, ширхэг, дүнг нэгтгэнэ", () => {
    const [g] = groupTx(
      [
        tx({ id: "1", qty: 3, value: 30000 }),
        tx({ id: "2", qty: 2, value: 20000, noPriceQty: 1 }),
      ],
      byDirection
    );
    expect(g.txCount).toBe(2);
    expect(g.qty).toBe(5);
    expect(g.value).toBe(50000);
    expect(g.noPriceQty).toBe(1);
    expect(g.label).toBe("Төв → Салбар 2");
  });

  it("өөр түлхүүрүүдийг салгаж, дүнгээр буурахаар эрэмбэлнэ", () => {
    const out = groupTx(
      [
        tx({ id: "1", qty: 1, value: 1000 }),
        tx({ id: "2", from_name: "Салбар 2", to_name: "Төв", qty: 9, value: 90000 }),
      ],
      byDirection
    );
    expect(out).toHaveLength(2);
    expect(out[0].key).toBe("Салбар 2→Төв");
    expect(out[0].value).toBe(90000);
  });

  it("сарын түлхүүр (YYYY-MM) үед цаг хугацааны өсөх эрэмбэ", () => {
    const out = groupTx(
      [
        tx({ id: "1", created_at: "2026-07-15T00:00:00Z", value: 100 }),
        tx({ id: "2", created_at: "2026-02-01T00:00:00Z", value: 999999 }),
      ],
      byMonth
    );
    // Дүнгээр биш, сараар эрэмбэлэгдэнэ (график зөв уншигдана).
    expect(out.map((g) => g.key)).toEqual(["2026-02", "2026-07"]);
  });

  it("хоосон жагсаалтад хоосон үр дүн", () => {
    expect(groupTx([], byDirection)).toEqual([]);
  });
});
