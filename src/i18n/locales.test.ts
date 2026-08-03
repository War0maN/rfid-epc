// ============================================================
// Гурван хэлний толь бичгийн бүрэн бүтэн байдал. CLAUDE.md-ийн дүрэм:
// "Шинэ UI текст нэмэхдээ 3 хэлэнд ЗЭРЭГ нэм — түлхүүрийн олонлог ижил
// байх ёстой." Энэ тест тэр дүрмийг автоматаар мөрдүүлнэ (дутуу түлхүүр
// нь UI дээр түүхий "reports.groupBranch" гэж харагдахад хүргэдэг).
// ============================================================
import { describe, it, expect } from "vitest";
import mn from "./locales/mn";
import en from "./locales/en";
import zh from "./locales/zh";
import { PERM_GROUPS } from "../lib/permissions";

type Dict = { [k: string]: string | Dict };

/** Үүрлэсэн толийг "секц.дэд.түлхүүр" хэлбэрийн жагсаалт болгоно. */
function flatten(obj: Dict, prefix = ""): Map<string, string> {
  const out = new Map<string, string>();
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.set(path, v);
    else for (const [nk, nv] of flatten(v, path)) out.set(nk, nv);
  }
  return out;
}

const dicts = {
  mn: flatten(mn as Dict),
  en: flatten(en as Dict),
  zh: flatten(zh as Dict),
};

describe("толь бичгийн түлхүүрүүд", () => {
  it("гурван хэлэнд ижил тооны түлхүүр", () => {
    expect(dicts.en.size).toBe(dicts.mn.size);
    expect(dicts.zh.size).toBe(dicts.mn.size);
  });

  it.each(["en", "zh"] as const)("%s хэлэнд дутуу/илүү түлхүүр байхгүй", (lang) => {
    const missing = [...dicts.mn.keys()].filter((k) => !dicts[lang].has(k));
    const extra = [...dicts[lang].keys()].filter((k) => !dicts.mn.has(k));
    expect(missing, `${lang}-д дутуу`).toEqual([]);
    expect(extra, `${lang}-д илүү (mn-д алга)`).toEqual([]);
  });

  // ЗОРИУДААР хоосон орхисон түлхүүрүүд (дуудагч тал нь хоосныг зөв
  // боловсруулдаг байх ёстой). transferNote.docSubtitle: англи падааны
  // гарчиг өөрөө "STOCK TRANSFER NOTE" тул дэд гарчиг давхардана —
  // lib/transferNote.ts хоосон үед мөрийг огт хэвлэхгүй.
  const INTENTIONALLY_EMPTY = new Set(["en:transferNote.docSubtitle"]);

  it.each(["mn", "en", "zh"] as const)("%s хэлэнд санамсаргүй хоосон утга байхгүй", (lang) => {
    const empty = [...dicts[lang].entries()]
      .filter(([, v]) => v.trim() === "")
      .map(([k]) => k)
      .filter((k) => !INTENTIONALLY_EMPTY.has(`${lang}:${k}`));
    expect(empty).toEqual([]);
  });

  it("орлуулга {{...}} гурван хэлэнд ижил хувьсагчтай", () => {
    const vars = (s: string) => [...s.matchAll(/{{\s*(\w+)/g)].map((m) => m[1]).sort();
    const mismatched: string[] = [];
    for (const [key, mnVal] of dicts.mn) {
      const want = JSON.stringify(vars(mnVal));
      for (const lang of ["en", "zh"] as const) {
        const v = dicts[lang].get(key);
        if (v && JSON.stringify(vars(v)) !== want) mismatched.push(`${lang}: ${key}`);
      }
    }
    expect(mismatched).toEqual([]);
  });
});

describe("код доторх орчуулгын түлхүүрүүд толинд бий", () => {
  const keysOf = (d: Map<string, string>) => d;

  it("эрхийн каталогийн бүх шошго гурван хэлэнд орчуулагдсан", () => {
    const wanted = PERM_GROUPS.flatMap((g) => [g.title, ...g.perms.map((p) => p.label)]);
    for (const lang of ["mn", "en", "zh"] as const) {
      const missing = wanted.filter((k) => !keysOf(dicts[lang]).has(k));
      expect(missing, lang).toEqual([]);
    }
  });
});
