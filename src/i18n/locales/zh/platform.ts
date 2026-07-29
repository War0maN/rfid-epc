// 平台监控 — components/PlatformConsole.tsx + lib/platform.ts。
export default {
  desc: "所有客户公司的使用情况 — 仅平台管理员可见。",

  // 汇总卡片
  cardTenants: "公司",
  cardUsers: "用户",
  cardBranches: "分店",
  cardEpcTotal: "已生成 EPC",
  cardLabels: "已消耗标签",
  cardLabelsSub: "含重新打印",

  // 公司表格
  thTenant: "公司",
  thCreated: "注册日期",
  thUsers: "用户",
  thBranches: "分店",
  thProducts: "商品",
  thEpcTotal: "EPC 总数",
  thEpcPrinted: "已打印",
  thLabels: "标签（实物）",
  thActive: "有效",
  thSold: "已售",
  thTx: "交易",
  thLastActivity: "最近操作",
  thLastSignIn: "最近登录",
  noTenants: "暂无公司。",
  unknownTenant: "（未知）",
  noDay: "（无日期）",
  never: "—",

  // 标签使用
  labelsSection: "标签使用",
  from: "开始",
  to: "结束",
  groupBy: "分组",
  groupMonth: "按月",
  groupDay: "按日",
  groupTenant: "按公司",
  thFirstPrints: "首次打印",
  thReprints: "重新打印",
  thTotal: "标签总数",
  noLabels: "该区间内没有打印记录。",
  grandTotal: "合计",

  reprintFootnote:
    "首次打印的历史完整；重新打印自新增 print_count 字段之后开始计数。",
  last30Days: "最近 30 天",
  last12Months: "最近 12 个月",
  thisYear: "今年",
};
