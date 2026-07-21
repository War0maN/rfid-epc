// Бүтээгдэхүүн (master) — ProductList / ProductForm / lib/products / lib/createProduct.
export default {
  // ProductList — багана
  colCat1: "Үндсэн ангилал",
  colCat2: "Дэд ангилал",
  colCat3: "Барааны ангилал",
  colGtin: "GTIN/баркод",
  colStock: "Үлдэгдэл",
  // ProductList — толгой хэсэг
  subtitle: 'Бараагаа энд бүртгэнэ. EPC-г дараа нь "EPC үүсгэх"-ээр тоо ширхгээр нь үүсгэнэ.',
  filtered: "Шүүсэн",
  columnsBtn: "Багана",
  visibleColumns: "Харагдах багана",
  addProduct: "+ Бараа нэмэх",
  // ProductList — хүснэгт
  filterPlaceholder: "Шүүх…",
  emptyNoProducts: 'Бараа алга. "+ Бараа нэмэх" дарж эхэл.',
  emptyNoMatch: "Тохирох бараа алга.",
  generateEpc: "EPC үүсгэх",
  page: "Хуудас",
  // ProductList — мессежүүд
  deleteBlocked:
    '"{{name}}" бараанд {{epcCount}} ширхэг EPC бүртгэлтэй тул устгах боломжгүй. Эхлээд холбогдох Ажлыг устгаж EPC-г цэвэрлэнэ үү.',
  confirmDelete: '"{{name}}" барааг устгах уу?',
  qtyRequired: "Тоо ширхэг оруулна уу.",
  generatedInfo: '"{{name}}" бараанд {{epcCount}} EPC үүслээ.',
  // ProductList — модалууд
  addProductTitle: "Бараа нэмэх",
  editProductTitle: "Бараа засах",
  genQuestion: "хэдэн ширхэг EPC үүсгэх вэ?",
  genCurrent: "одоо {{epcCount}}ш",
  quantity: "Тоо ширхэг",
  dismiss: "Болих",
  generating: "Үүсгэж байна…",
  generate: "Үүсгэх",
  // ProductForm
  attrRequired: '"{{label}}" заавал бөглөнө.',
  nameLabel: "Барааны нэр",
  namePlaceholder: "Цамц",
  skuLabel: "SKU / код",
  optionalPlaceholder: "Заавал биш",
  gtinLabel: "GTIN / баркод",
  gtinPlaceholder: "Заавал биш (байвал SGTIN-96)",
  attributesTitle: "Шинж чанар",
  selectOption: "— Сонгох —",
  extraAttrsTitle: "Нэмэлт шинж чанар",
  extraAttrsHint: "Жагсаалтад байхгүй шинж чанар нэмбэл автоматаар бүртгэгдэнэ.",
  valuePlaceholder: "Утга",
  saving: "Хадгалж байна…",
  createProduct: "Бараа үүсгэх",
  // lib/products.ts
  deleteBlockedFk:
    "Энэ бараанд EPC бүртгэлтэй тул устгах боломжгүй. Эхлээд холбогдох Ажлыг устгаж EPC-г цэвэрлэнэ үү (үлдэгдэл 0 болсны дараа устгана).",
  // lib/createProduct.ts
  nameRequired: "Барааны нэр оруулна уу.",
  qtyMin: "Тоо ширхэг 1-ээс багагүй байх ёстой.",
  jobNumberBusy: "Ажлын дугаар олгоход зөрчил гарлаа — дахин оролдоно уу.",
};
