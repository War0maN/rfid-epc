// EPC table (EpcTable) — columns, bulk actions, modals, CSV headers.
export default {
  // Column headers (table + CSV export)
  colEpcHex: "EPC (hex)",
  colSerial: "Serial",
  colCat1: "Main category",
  colCat2: "Subcategory",
  colCat3: "Item category",
  colGtin: "GTIN/barcode",
  colBox: "Box",
  colJob: "Job no.",
  colDate: "Arrival date",
  colSupplier: "Supplier",
  colCreated: "Created",
  csvEpcUri: "EPC URI",
  csvEpcTagUri: "EPC Tag URI",

  // Action bar
  filtered: "Filtered",
  columns: "Columns",
  visibleColumns: "Visible columns",
  clearFilters: "Clear filters",
  exportCsvN: "Export CSV ({{n}})",
  printN: "Print ({{n}})",
  changeStatusTitle: "Change status of the selected (or all filtered) EPCs",
  changeStatusN: "Change status ({{n}})…",
  deleteN: "Delete ({{n}})",
  clearSelectionN: "Clear selection ({{n}})",
  preparing: "Preparing…",

  // Table
  selectPageAll: "Select all on this page",
  sort: "Sort",
  filterPlaceholder: "Filter…",
  loadingEpcData: "Loading EPC data…",
  noFilterMatch: "No rows match the filters.",
  noEpc: "No EPCs yet.",
  printedAt: "Printed: {{date}}",
  viewHistory: "View history",
  page: "Page",

  // Errors / notices
  noRowsToChange: "No rows to change status for.",
  noRowsToPrint: "No rows to print.",
  deleteResult:
    "Deleted {{deleted}} EPCs. Skipped: {{hist}} with transaction history, {{status}} not Unprinted (protected).",
  deleteFkProtected:
    "Some EPCs cannot be deleted because they have transaction history or a protected status.",

  // Delete confirmation modal — only Unprinted can be deleted
  deleteTitle: "Delete EPCs",
  deleteBody:
    "Of the <b>{{selected}}</b> selected EPCs, <r>{{deletable}}</r> (Unprinted) will be deleted.",
  deleteBodyFiltered:
    "Of the <b>{{n}}</b> EPCs matching the filter, only those with <r>Unprinted</r> status will be deleted.",
  deleteProtectedNote:
    "{{n}} with a status other than Unprinted are protected — they will not be deleted. (An activated EPC counts as having movement; to really delete it, set it back to Unprinted first.)",
  deleteSkipNote:
    "Note: EPCs with transaction history (e.g. previously sold) are skipped automatically.",
  deleteConfirm: "Are you sure? This cannot be undone.",
  nothingDeletable: "No EPCs can be deleted.",
  dismiss: "Cancel",

  // Change status modal
  statusTitle: "Change status",
  statusBodySelected: "Set the status of the <b>{{n}}</b> selected EPCs to <s>{{status}}</s>.",
  statusBodyFiltered:
    "Set the status of all <b>{{n}}</b> EPCs matching the filters to <s>{{status}}</s>.",
  notePlaceholder: "E.g. written off, lost…",
  change: "Change",
};
