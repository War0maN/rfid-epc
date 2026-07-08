// EPC lifecycle history — lib/epcHistory.ts (EVENT_META labels + detail lines).
export default {
  // Event type labels (EVENT_META label)
  created: "Created",
  printed: "Printed and activated",
  statusChange: "Status changed",
  transferOut: "Transferred out",
  transferIn: "Transfer received",
  transferCancel: "Transfer cancelled",
  sold: "Sold",
  other: "Other",
  returned: "Return",
  // Human-readable detail lines
  noBranch: "(No branch)",
  branchDetail: "Branch: {{branch}}",
  printedDetail: "Label printed and registered in stock",
  transferCancelDetail: "Returned to {{branch}}",
  returnedDetail: "Returned to active — Branch: {{branch}}",
};
