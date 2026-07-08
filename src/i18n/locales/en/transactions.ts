// Transactions — Transactions.tsx + lib/transactions.ts (type/status labels).
export default {
  type: {
    sale: "Sold",
    transfer: "Transfer",
    other: "Other",
    return: "Return",
  },
  status: {
    pending: "Pending",
    done: "Done",
    cancelled: "Cancelled",
  },

  title: "Transactions",
  subtitle:
    "Sale, transfer, other — pick a branch, then scan/type EPCs into the cart. Transactions are never deleted (history).",
  refresh: "Refresh",
  tabHistory: "Transaction history",
  noPermission: 'You do not have permission to create transactions. See the "Transaction history" tab.',

  typeLabel: "Type",
  fromBranch: "Branch (from)",
  toBranch: "To branch",
  selectOption: "— Select —",
  notePlaceholder: "Optional…",
  selectBranchFirst: "Select a branch first — the list of active EPCs in that branch will appear.",

  scanPlaceholder: "📶 Scan / type EPC (Enter) — an RFID reader types directly here",
  scanAlreadyInCart: "{{hex}} — already in the cart.",
  scanInvalidFormat: "{{token}} — invalid EPC format.",
  scanNotFound: "{{hex}} — not found in this branch's list.",
  scanAdded: "+ {{n}} added",

  cart: "Cart",
  cartEmpty: "Empty — scan an EPC or click an item in the list below.",
  colItemName: "Item name",
  colEpcCode: "EPC code",
  colItemPrice: "Item price",
  remove: "Remove",
  confirmButton: "Confirm {{type}} ({{n}} pcs · {{total}}₮)",

  availReturnable: "Returnable EPC",
  availActive: "Active EPC",
  availSearchPlaceholder: "Search (name/SKU/barcode/EPC)…",
  emptyReturnable: "No returnable (Sold/Other) EPCs in this branch.",
  emptyActive: "No active EPCs in this branch.",
  emptyFiltered: "No matching EPCs.",
  moreRows: "… {{n}} total — narrow down with search",

  successInfo: "{{type}} successful: {{n}} EPC · {{total}}₮",
  pendingSuffix: "(awaiting receipt)",
  receiveConfirm: 'Receive {{n}} EPC at branch "{{branch}}"?',
  receiveSuccess: "Transfer received — the EPCs are now Active at the destination branch.",
  cancelConfirm: "Cancel the transfer? {{n}} EPC will return to Active at the source branch.",
  cancelSuccess: "Transfer cancelled — the EPCs returned to their source branch.",

  noBranch: "(No branch)",
  colWho: "By",
  colReceipt: "Receipt",
  noTransactions: "No transactions.",
  receive: "Receive",
};
