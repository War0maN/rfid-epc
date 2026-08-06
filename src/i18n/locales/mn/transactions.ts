// Гүйлгээ — Transactions.tsx + lib/transactions.ts (төрөл/төлөвийн нэрс).
export default {
  searchPh: "Хайх (дугаар / салбар / хэн / тэмдэглэл)…",
  // Гүйлгээний төрөл (TX_TYPE_LABEL)
  type: {
    sale: "Борлуулалт",
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
  scanPlaceholder: "EPC уншуулах / шивэх (Enter) — RFID уншигч шууд энд бичнэ",
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
  // Шат 4: хэсэгчлэн хүлээн авах явц
  receivedProgress: "Ирсэн {{n}}/{{total}}",
  colReceived: "Ирсэн",
  inTransit: "Замд",
  drafts: {
    tab: "Даалгавар",
    subtitle:
      "Нээлттэй бүх сагс нэг дор: вебээс өгсөн даалгавар + уншигчаас нээсэн чөлөөт сагс. Гүйцэтгэл нь уншигч дээр; илгээгдмэгц ердийн гүйлгээ болж Түүхэнд орно.",
    newJob: "Даалгавар үүсгэх",
    created: "Даалгавар үүслээ — уншигчийн жагсаалтад гарч ирнэ.",
    cancelled: "Ноорог цуцлагдлаа.",
    empty: "Нээлттэй даалгавар, сагс алга.",
    noFrom: "Эх салбар тогтоогүй",
    freeCart: "Чөлөөт сагс · {{n}} ш",
    colPlanned: "Даалгасан",
    colPicked: "Уншсан",
    cancelBtn: "Цуцлах",
    confirmCancel:
      "Энэ ноорогийг цуцлах уу?\n\nГүйлгээ үүсэхгүй, сагсанд орсон бараанд юу ч болохгүй.",
    fromBranch: "Эх салбар",
    toBranch: "Очих салбар",
    note: "Тэмдэглэл",
    choose: "— Сонгох —",
    pickFromFirst: "Эхлээд эх салбараа сонгоно уу — үлдэгдэл нь эндээс харагдана.",
    srcStock: "Үлдэгдлээс",
    srcAll: "Бүх бараанаас",
    filterPh: "Нэр / SKU / баркодоор шүүх…",
    colAvail: "Үлдэгдэл",
    colQty: "Тоо",
    noStock: "Энэ салбарт идэвхтэй үлдэгдэл алга.",
    planSummary: "{{products}} бараа · {{qty}} ширхэг даалгана",
    planEmpty: "Бараа сонгоогүй байна",
    creating: "Үүсгэж байна…",
    excelBtn: "Excel-ээс",
    excelHint: "Багана: Баркод / SKU / Нэр + Тоо (хүлээн авалтын загвартай ижил толгой). Зөвхөн бүртгэлтэй бараа таарна — шинэ бараа үүсгэхгүй.",
    excelDone: "Excel-ээс {{products}} бараа · {{qty}} ширхэг нэмэгдлээ.",
    excelUnmatched: "Таараагүй {{n}} мөр (бүртгэлгүй бараа — алгасав):",
    createBtn: "Даалгавар өгөх",
  },
};
