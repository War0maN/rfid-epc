import { describe, it, expect } from "vitest";
import { ALL_PERMS, makeCan, PERM_GROUPS, TAB_PERM, type Perm } from "./permissions";

describe("makeCan", () => {
  it("null = бүрэн эрх (админ эсвэл тохиргоогүй хэрэглэгч)", () => {
    const can = makeCan(null);
    expect(ALL_PERMS.every((p) => can(p))).toBe(true);
  });

  it("ХООСОН массив = юу ч зөвшөөрөхгүй (null-аас ялгаатай)", () => {
    // App.tsx нь perms.length === 0 үед null болгож дамжуулдаг тул энэ
    // ялгаа чухал: хоосон массив санамсаргүй дамжвал бүх зүйл нуугдана.
    const can = makeCan([]);
    expect(ALL_PERMS.some((p) => can(p))).toBe(false);
  });

  it("зөвхөн олгосон эрхийг зөвшөөрнө", () => {
    const can = makeCan(["tab_epc", "act_print"]);
    expect(can("tab_epc")).toBe(true);
    expect(can("act_print")).toBe(true);
    expect(can("act_sale")).toBe(false);
    expect(can("tab_audit")).toBe(false);
  });

  it("танихгүй түлхүүр жагсаалтад байсан ч бусдыг нээхгүй", () => {
    const can = makeCan(["хачин_эрх"]);
    expect(ALL_PERMS.some((p) => can(p))).toBe(false);
  });
});

describe("эрхийн каталогийн бүрэн бүтэн байдал", () => {
  it("ALL_PERMS-д давхардсан түлхүүр байхгүй", () => {
    expect(new Set(ALL_PERMS).size).toBe(ALL_PERMS.length);
  });

  it("бүх таб-эрх каталогид бүртгэлтэй (үгүй бол таб мөнхөд нуугдана)", () => {
    const known = new Set<Perm>(ALL_PERMS);
    for (const [tab, perm] of Object.entries(TAB_PERM)) {
      expect(known.has(perm), `TAB_PERM.${tab} = ${perm}`).toBe(true);
    }
  });

  it("бүлэг бүрд эрх байгаа, шошго нь орчуулгын түлхүүр", () => {
    expect(PERM_GROUPS.length).toBeGreaterThan(0);
    for (const g of PERM_GROUPS) {
      expect(g.perms.length).toBeGreaterThan(0);
      expect(g.title).toMatch(/^permissions\./);
      for (const p of g.perms) expect(p.label).toMatch(/^permissions\./);
    }
  });
});
