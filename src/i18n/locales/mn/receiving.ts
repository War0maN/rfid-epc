// Хүлээн авалт (Ү2) — Receiving.tsx + lib/receiving.ts
export default {
  title: "Хүлээн авалт",
  subtitle:
    "Үйлдвэрээс RFID таг-тай ирсэн барааг packing list-тэй тулгаж бүртгэнэ. Таг-гүй үлдэгдэлд хаах үедээ EPC үүсгэж хэвлэнэ.",
  newBtn: "Хүлээн авалт",
  empty: "Хүлээн авалт алга. Packing list-ээ оруулж эхлээрэй.",
  colNumber: "Ажлын №",
  statusOpen: "Нээлттэй",
  statusClosed: "Хаагдсан",

  // Үүсгэх форм
  fileLabel: "Packing list (xlsx)",
  fileRequired: "Packing list файлаа сонгоно уу.",
  branchSelect: "Салбар сонгох…",
  branchRequired: "Хүлээн авах салбараа сонгоно уу.",
  arrivalDate: "Ирсэн огноо",
  numberLabel: "Ажлын № (заавал биш)",
  numberPlaceholder: "Хоосон бол RCV-0001…",
  createHint:
    "Excel-ийн багана: нэр/SKU/баркод/тоо (импорттой ижил). Бараанууд автоматаар бүртгэгдэнэ; аль нь таг-тай, аль нь таг-гүйг уншилтын явцад тулгаж мэднэ.",
  createBtn: "Үүсгэх",
  creating: "Үүсгэж байна…",
  createdInfo: "Хүлээн авалт үүслээ: {{products}} бараа, нийт {{total}} ширхэг хүлээгдэж байна.",

  // Дэлгэрэнгүй
  backToList: "Жагсаалт",
  scanLabel: "EPC уншуулах (уншигчаар эсвэл бичиж Enter; олныг зэрэг paste хийж болно)",
  scanBtn: "Илгээх",
  scanInvalid: "Буруу EPC: {{token}}",
  colExpected: "Хүлээгдэж буй",
  colScanned: "Уншигдсан",
  colGenerated: "Үүсгэсэн",
  colRemainder: "Үлдэгдэл",
  total: "НИЙТ",
  issuesTitle: "Асуудалтай уншилт ({{n}})",
  printHint: "Үүсгэсэн EPC-үүдийг хэвлэх: Бараа (EPC) хуудаснаас {{job}} ажлаар шүүж Хэвлэх.",

  // Уншилтын үр дүн
  resMatched: "Бүртгэгдсэн: {{n}}",
  resAlready: "Аль хэдийн бүртгэлтэй (үл тооцов): {{n}}",
  resUnknown: "Танигдаагүй GTIN: {{n}}",
  resNotOnList: "Жагсаалтад байхгүй: {{n}}",
  resUndecodable: "Задрахгүй (SGTIN биш): {{n}}",
  resSerialConflict: "Serial давхцсан: {{n}}",
  resSkipped: "Өмнө илгээгдсэн: {{n}}",
  resNothing: "Шинэ уншилт алга.",
  outcome: {
    already_registered: "аль хэдийн бүртгэлтэй (үл тооцов)",
    unknown_gtin: "GTIN нь каталогид алга",
    not_on_list: "энэ ажлын жагсаалтад алга",
    undecodable: "SGTIN-96 биш / задрахгүй",
    serial_conflict: "serial давхцсан (сануулга)",
  },

  // Хаах
  closeBtn: "Хаах…",
  closeTitle: "Хүлээн авалт хаах",
  closeBody:
    "Нийт {{n}} ширхэг дутуу байна. Чеклэгдсэн бараанд үлдэгдлийн тоогоор EPC үүсгэнэ (таг-гүй ирсэн — хэвлэж наана); чеклэгдээгүй нь ДУТУУ гэж бүртгэгдэнэ.",
  closeHint: "Үүсгэсэн EPC Хэвлээгүй төлөвтэй үүснэ — хэвлэхэд Идэвхтэй болно.",
  closeAllScanned: "Бүх бараа бүрэн уншигдсан байна. Хаахад бэлэн.",
  closeConfirm: "Хаах",
  closing: "Хааж байна…",
  closedInfo: "Хүлээн авалт хаагдлаа.",
  closedWithGenerated: "Хүлээн авалт хаагдаж, {{n}} EPC үүсгэгдлээ (Хэвлээгүй — хэвлэж наагаарай).",
};
