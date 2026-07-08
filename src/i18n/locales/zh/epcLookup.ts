// EPC 搜索（扫描）+ 历史时间线 — components/EpcLookup.tsx.
export default {
  title: "EPC 搜索",
  subtitle: "请输入 RFID 标签读取的 24 位十六进制码进行搜索——将显示商品信息及完整历史。",
  searching: "搜索中…",
  notFound: "未找到该 EPC 记录。",
  unnamedItem: "未命名商品",
  historyTitle: "历史",
  historyLoading: "历史加载中…",
  historyEmpty: "暂无历史。（请确认已在 Supabase 中运行 schema.sql 的 epc_events 部分。）",
};
