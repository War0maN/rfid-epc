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
  exportZplN: "Export ZPL ({{n}})",
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
  deletedProtected:
    "Deleted {{deleted}} EPCs. {{kept}} were kept because they have transaction history (historical data is never deleted).",
  deleteFkProtected:
    "Some EPCs cannot be deleted because they have transaction history or a protected status.",

  // Delete confirmation modal
  deleteTitle: "Delete EPCs",
  deleteBody:
    "Of the <b>{{selected}}</b> selected EPCs, <r>{{deletable}}</r> (Unprinted/Active) will be deleted.",
  deleteProtectedNote:
    "{{n}} with Sold/Transferring/Other status are historical data and protected — they will not be deleted.",
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
