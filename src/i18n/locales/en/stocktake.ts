export default {
  title: "Stocktake",
  subtitle:
    "Reconcile a branch's Active items against reality. The register is frozen (snapshot) at start and stays fixed while counting.",
  newBtn: "Start stocktake",
  empty: "No stocktakes yet. Pick a branch to start.",
  colNumber: "Number",
  statusOpen: "Open",
  statusClosed: "Closed",

  branchSelect: "Select branch…",
  branchRequired: "Select the branch to count.",
  createHint:
    "At start, all Active EPCs of the branch are frozen as the expected list. Only one open stocktake per branch.",
  createBtn: "Start",
  creating: "Starting…",
  createdInfo: "Stocktake started — begin scanning.",

  backToList: "Back to list",
  cardFoundExpected: "Counted / Expected",
  cardMissing: "Missing",
  cardExtra: "Extra",
  clickForDetail: "Click for details",
  scanLabel: "Scan EPC (reader or type + Enter; paste multiple at once)",
  scanBtn: "Submit",
  scanInvalid: "Invalid EPC: {{token}}",
  colExpected: "Expected",
  colFound: "Counted",
  colMissing: "Missing",
  total: "TOTAL",

  resFound: "Counted: {{n}}",
  resNotExpected: "Unexpected (not in this branch's register): {{n}}",
  resSkipped: "Previously submitted: {{n}}",
  resNothing: "No new scans.",

  missingTitle: "Missing ({{n}})",
  extrasTitle: "Extras ({{n}})",
  extrasScanTimeHint:
    "Status/branch show the state AT SCAN TIME — explaining why the tag was extra (frozen even if changed later). Active (other-branch) and Unprinted tags can be registered to this branch; Sold/Other can only come back via a return.",
  absorbButton: "Register to this branch ({{n}})",
  absorbConfirm:
    "Make {{n}} tags Active at {{branch}} and move them to Counted? (Recorded in history)",
  absorbDone: "Registered to this branch: {{done}}",
  absorbSkipped: "skipped: {{n}} (Sold/Other/In transfer)",

  closeBtn: "Close",
  closeConfirmText: "Close this stocktake? No more scans can be added afterwards.",
  closedInfo: "Stocktake closed. Review the missing items and write them off if needed.",

  writeOffBtn: "Write off missing ({{n}})",
  writeOffHint:
    "Write-off sets the missing EPCs to 'Other' (a real transaction is recorded with a note — nothing is deleted). Admin only.",
  writeOffConfirm: "Write off {{n}} missing EPCs as 'Other'? This is recorded in history.",
  writeOffPrefix: "Stocktake {{number}}",
  writeOffReasonLabel: "Write-off reason (required)",
  writeOffReasonPlaceholder: "E.g. lost, damaged, not found…",
  openExists: "This branch already has an open stocktake ({{number}}) — close it first.",
  writeOffDone: "{{n}} EPCs written off (Other).",
};
