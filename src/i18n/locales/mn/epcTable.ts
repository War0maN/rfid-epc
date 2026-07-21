// EPC хүснэгт (EpcTable) — багана, бөөн үйлдэл, модал, CSV толгойнууд.
export default {
  // Баганын толгойнууд (хүснэгт + CSV export хоёуланд)
  colEpcHex: "EPC (hex)",
  colSerial: "Serial",
  colCat1: "Үндсэн ангилал",
  colCat2: "Дэд ангилал",
  colCat3: "Барааны ангилал",
  colGtin: "GTIN/баркод",
  colBox: "Хайрцаг",
  colJob: "Ажлын №",
  colDate: "Ирсэн огноо",
  colSupplier: "Нийлүүлэгч",
  colCreated: "Үүссэн",
  csvEpcUri: "EPC URI",
  csvEpcTagUri: "EPC Tag URI",

  // Үйлдлийн мөр
  filtered: "Шүүсэн",
  columns: "Багана",
  visibleColumns: "Харагдах багана",
  clearFilters: "Шүүлт цэвэрлэх",
  exportCsvN: "CSV татах ({{n}})",
  printN: "Хэвлэх ({{n}})",
  changeStatusTitle: "Сонгосон (эсвэл шүүлтэд тохирох бүх) EPC-ийн төлөв өөрчлөх",
  changeStatusN: "Төлөв өөрчлөх ({{n}})…",
  deleteN: "Устгах ({{n}})",
  clearSelectionN: "Сонголт цэвэрлэх ({{n}})",
  preparing: "Бэлдэж байна…",

  // Хүснэгт
  selectPageAll: "Энэ хуудсыг бүгдийг сонгох",
  sort: "Эрэмбэлэх",
  filterPlaceholder: "Шүүх…",
  loadingEpcData: "EPC өгөгдөл ачаалж байна…",
  noFilterMatch: "Шүүлтэд тохирох мөр алга.",
  noEpc: "EPC алга.",
  printedAt: "Хэвлэсэн: {{date}}",
  viewHistory: "Түүхийг харах",
  page: "Хуудас",

  // Алдаа / мэдэгдэл
  noRowsToChange: "Төлөв өөрчлөх мөр алга.",
  noRowsToPrint: "Хэвлэх мөр алга.",
  deleteResult:
    "{{deleted}} EPC устгав. Алгассан: гүйлгээний түүхтэй {{hist}}, Хэвлээгүй биш төлөвтэй {{status}} (хамгаалагдсан).",
  deleteFkProtected:
    "Зарим EPC гүйлгээний түүхтэй эсвэл хамгаалагдсан төлөвтэй тул устгах боломжгүй.",

  // Устгах баталгаажуулах модал — зөвхөн Хэвлээгүй устгагдана
  deleteTitle: "EPC устгах",
  deleteBody:
    "Сонгосон <b>{{selected}}</b> EPC-ээс <r>{{deletable}}</r> ширхэг (Хэвлээгүй) устгагдана.",
  deleteBodyFiltered:
    "Шүүлтэд тохирох <b>{{n}}</b> EPC-ээс зөвхөн <r>Хэвлээгүй</r> төлөвтэй нь устгагдана.",
  deleteProtectedNote:
    "Хэвлээгүй биш төлөвтэй {{n}} нь хамгаалагдсан — устгагдахгүй. (Идэвхтэй болсон EPC хөдөлгөөнтэйд тооцогдоно; үнэхээр устгах бол эхлээд Хэвлээгүй болгоно.)",
  deleteSkipNote:
    "Жич: гүйлгээний түүхтэй (өмнө нь борлуулагдаж байсан г.м.) EPC автоматаар алгасагдана.",
  deleteConfirm: "Итгэлтэй байна уу? Буцаах боломжгүй.",
  nothingDeletable: "Устгах боломжтой EPC алга.",
  dismiss: "Болих",

  // Төлөв өөрчлөх модал
  statusTitle: "Төлөв өөрчлөх",
  statusBodySelected: "Сонгосон <b>{{n}}</b> EPC-ийн төлөвийг <s>{{status}}</s> болгоно.",
  statusBodyFiltered: "Шүүлтэд тохирох <b>{{n}}</b> EPC-ийн төлөвийг <s>{{status}}</s> болгоно.",
  notePlaceholder: "Жишээ: актласан, алга болсон…",
  change: "Өөрчлөх",
};
