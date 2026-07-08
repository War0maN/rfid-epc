// ============================================================
// labelMap — lib доторх Record<код, нэр> label map-уудыг i18n-д
// шилжүүлэхдээ API-г нь хэвээр хадгалах туслах. Утга нь орчуулгын
// ТҮЛХҮҮР; уншилт бүрд тухайн үеийн хэлээр t() дуудагдана (getter).
// Дуудагч талууд өөрчлөгдөхгүй: STATUS_LABEL[s] хэвээр ажиллана.
// ============================================================
import i18n from "./index";

export function labelMap<K extends string>(keys: Record<K, string>): Record<K, string> {
  const out = {} as Record<K, string>;
  for (const k of Object.keys(keys) as K[]) {
    Object.defineProperty(out, k, {
      get: () => i18n.t(keys[k]),
      enumerable: true,
    });
  }
  return out;
}
