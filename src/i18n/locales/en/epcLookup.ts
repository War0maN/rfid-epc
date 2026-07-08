// EPC lookup (scan) + history timeline — components/EpcLookup.tsx.
export default {
  title: "EPC search",
  subtitle: "Enter the 24-character hex read from an RFID tag to search — item details and full history will appear.",
  searching: "Searching…",
  notFound: "This EPC was not found in the registry.",
  unnamedItem: "Unnamed item",
  historyTitle: "History",
  historyLoading: "Loading history…",
  historyEmpty: "No history. (Check that the epc_events section of schema.sql has been run in Supabase.)",
};
