// EPC-ийн амьдралын түүх — lib/epcHistory.ts (EVENT_META нэрс + detail мөрүүд).
export default {
  // Үйл явдлын төрлийн нэрс (EVENT_META label)
  created: "Үүссэн",
  printed: "Хэвлэж идэвхжүүлсэн",
  statusChange: "Төлөв өөрчилсөн",
  transferOut: "Шилжүүлэгт гарсан",
  transferIn: "Шилжүүлэг хүлээн авсан",
  transferCancel: "Шилжүүлэг цуцлагдсан",
  sold: "Борлуулсан",
  other: "Бусад гүйлгээ",
  returned: "Буцаалт",
  // Хүн уншихуйц detail мөрүүд
  noBranch: "(Салбаргүй)",
  branchDetail: "Салбар: {{branch}}",
  printedDetail: "Шошго хэвлэгдэж, агуулахад бүртгэгдсэн",
  transferCancelDetail: "{{branch}}-д буцсан",
  returnedDetail: "Идэвхтэй болж буцсан — Салбар: {{branch}}",
};
