// EPC 生命周期历史 — lib/epcHistory.ts（EVENT_META 名称 + 详情文本）。
export default {
  // 事件类型名称（EVENT_META label）
  created: "已创建",
  printed: "已打印激活",
  statusChange: "状态变更",
  transferOut: "调拨出库",
  transferIn: "调拨接收",
  transferCancel: "调拨已取消",
  sold: "已售",
  other: "其他",
  returned: "退货",
  // 详情文本
  noBranch: "（无分店）",
  branchDetail: "分店：{{branch}}",
  printedDetail: "标签已打印并登记入库",
  transferCancelDetail: "已退回 {{branch}}",
  returnedDetail: "已恢复为有效 — 分店：{{branch}}",
};
