// Packing list Excel импорт (lib/importPackingList.ts) — толгой таних,
// мөр тус бүрийн шалгалтын алдаанууд ({{row}} = Excel-ийн мөрийн дугаар).
export default {
  readFailed: "Excel-ийг уншиж чадсангүй (хүснэгтийн формат таниагдсангүй).",
  needHeaderAndRow: "Файлд толгой + дор хаяж нэг мөр байх ёстой.",
  pieceColumnMissing: "'piece' (тоо ширхэг) багана олдсонгүй.",
  identifyColumnMissing: "Барааг таних багана (barcode, sku эсвэл name) олдсонгүй.",
  rowError: "Мөр {{row}}: {{message}}",
  rowPieceInvalid: "Мөр {{row}}: piece буруу ({{value}})",
  noValidRows: "Импортлох хүчинтэй мөр олдсонгүй.",
  productMissing: "бараа олдсонгүй ({{key}})",
};
