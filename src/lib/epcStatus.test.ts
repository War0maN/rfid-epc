import { describe, it, expect } from "vitest";
import { badgeOf, EPC_STATUSES, labelOf, STATUS_BADGE, STATUS_LABEL } from "./epcStatus";

describe("EPC төлөвийн каталог", () => {
  it("жагсаалт нь lifecycle дарааллаар, бүх төлөв хамрагдсан", () => {
    expect(EPC_STATUSES).toEqual(["unprinted", "active", "sold", "transferring", "other"]);
    expect(Object.keys(STATUS_BADGE).sort()).toEqual([...EPC_STATUSES].sort());
    expect(Object.keys(STATUS_LABEL).sort()).toEqual([...EPC_STATUSES].sort());
  });

  it("төлөв бүр орчуулагдсан нэртэй (код нь өөрөө үлдээгүй)", () => {
    for (const s of EPC_STATUSES) {
      expect(labelOf(s), s).not.toBe(s);
      expect(labelOf(s).length, s).toBeGreaterThan(0);
    }
  });

  it("танихгүй төлвийг өөрийг нь буцаана (эвдрэхгүй)", () => {
    expect(labelOf("хачин")).toBe("хачин");
    expect(badgeOf("хачин")).toBe(STATUS_BADGE.unprinted);
  });

  it("badge бүр Tailwind фон + текстийн класстай", () => {
    for (const s of EPC_STATUSES) {
      expect(badgeOf(s), s).toMatch(/bg-\S+\s+text-\S+/);
    }
  });
});
