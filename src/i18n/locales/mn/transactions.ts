// Гүйлгээ — Transactions.tsx + lib/transactions.ts (төрөл/төлөвийн нэрс).
export default {
  // Гүйлгээний төрөл (TX_TYPE_LABEL)
  type: {
    sale: "Борлуулсан",
    transfer: "Шилжүүлэг",
    other: "Бусад гүйлгээ",
    return: "Буцаалт",
  },
  // Гүйлгээний төлөв (TX_STATUS_LABEL)
  status: {
    pending: "Хүлээгдэж буй",
    done: "Дууссан",
    cancelled: "Цуцлагдсан",
  },

  title: "Гүйлгээ",
  subtitle:
    "Борлуулалт, шилжүүлэг, бусад — салбараа сонгоод EPC-г уншуулж/шивж сагсанд нэмнэ. Гүйлгээ устгагдахгүй (түүх).",
  refresh: "Сэргээх",
  tabHistory: "Гүйлгээний түүх",
  noPermission: 'Танд гүйлгээ хийх эрх байхгүй. Түүхийг "Гүйлгээний түүх" таб-аас харна уу.',

  // Тохиргооны мөр
  typeLabel: "Төрөл",
  fromBranch: "Салбар (эх)",
  toBranch: "Очих салбар",
  selectOption: "— Сонгох —",
  notePlaceholder: "Сонголт…",
  selectBranchFirst: "Эхлээд салбараа сонгоно уу — тухайн салбарын идэвхтэй EPC-ийн жагсаалт гарч ирнэ.",

  // Скан
  scanPlaceholder: "📶 EPC уншуулах / шивэх (Enter) — RFID уншигч шууд энд бичнэ",
  scanAlreadyInCart: "{{hex}} — сагсанд аль хэдийн байна.",
  scanInvalidFormat: "{{token}} — EPC формат буруу.",
  scanNotFound: "{{hex}} — энэ салбарын жагсаалтаас олдсонгүй.",
  scanAdded: "+ {{n}} нэмэгдлээ",

  // Сагс
  cart: "Сагс",
  cartEmpty: "Хоосон — EPC уншуулах эсвэл доорх жагсаалтаас дарж нэмнэ.",
  colItemName: "Барааны нэр",
  colEpcCode: "EPC код",
  colItemPrice: "Барааны үнэ",
  remove: "Хасах",
  confirmButton: "{{type}} баталгаажуулах ({{n}}ш · {{total}}₮)",

  // Салбарын EPC жагсаалт
  availReturnable: "Буцаах боломжтой EPC",
  availActive: "Идэвхтэй EPC",
  availSearchPlaceholder: "Хайх (нэр/SKU/баркод/EPC)…",
  emptyReturnable: "Энэ салбарт буцаах боломжтой (Борлуулсан/Бусад гүйлгээт) EPC алга.",
  emptyActive: "Энэ салбарт идэвхтэй EPC алга.",
  emptyFiltered: "Тохирох EPC алга.",
  moreRows: "… нийт {{n}} — хайлтаар нарийсгана уу",

  // Мэдэгдэл / баталгаажуулалт
  successInfo: "{{type}} амжилттай: {{n}} EPC · {{total}}₮",
  pendingSuffix: "(хүлээн авахаар хүлээгдэж байна)",
  receiveConfirm: '{{n}} EPC-г "{{branch}}" салбарт хүлээн авах уу?',
  receiveSuccess: "Шилжүүлэг хүлээн авлаа — EPC-үүд очих салбартаа Идэвхтэй боллоо.",
  cancelConfirm: "Шилжүүлгийг цуцлах уу? {{n}} EPC эх салбартаа Идэвхтэй буцна.",
  cancelSuccess: "Шилжүүлэг цуцлагдлаа — EPC-үүд эх салбартаа буцлаа.",

  // Түүх
  noBranch: "(Салбаргүй)",
  colWho: "Хэн",
  colReceipt: "Хүлээн авалт",
  noTransactions: "Гүйлгээ алга.",
  receive: "Хүлээн авах",
};
