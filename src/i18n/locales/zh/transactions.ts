// 交易 — Transactions.tsx + lib/transactions.ts（类型/状态名称）。
export default {
  type: {
    sale: "已售",
    transfer: "调拨",
    other: "其他",
    return: "退货",
  },
  status: {
    pending: "待处理",
    done: "已完成",
    cancelled: "已取消",
  },

  title: "交易",
  subtitle: "销售、调拨、其他——选择分店后扫描/输入EPC加入购物车。交易不会被删除（记录）。",
  refresh: "刷新",
  tabHistory: "交易记录",
  noPermission: "您没有创建交易的权限。请在“交易记录”标签页查看记录。",

  typeLabel: "类型",
  fromBranch: "分店（来源）",
  toBranch: "目标分店",
  selectOption: "— 请选择 —",
  notePlaceholder: "选填…",
  selectBranchFirst: "请先选择分店——该分店的有效EPC列表将显示在这里。",

  scanPlaceholder: "📶 扫描/输入EPC（回车）——RFID读写器可直接在此输入",
  scanAlreadyInCart: "{{hex}}——已在购物车中。",
  scanInvalidFormat: "{{token}}——EPC格式无效。",
  scanNotFound: "{{hex}}——未在该分店列表中找到。",
  scanAdded: "+ 已添加{{n}}件",

  cart: "购物车",
  cartEmpty: "空——扫描EPC或点击下方列表添加。",
  colItemName: "商品名称",
  colEpcCode: "EPC码",
  colItemPrice: "商品价格",
  remove: "移除",
  confirmButton: "确认{{type}}（{{n}}件 · {{total}}₮）",

  availReturnable: "可退货EPC",
  availActive: "有效EPC",
  availSearchPlaceholder: "搜索（名称/SKU/条码/EPC）…",
  emptyReturnable: "该分店没有可退货（已售/其他）的EPC。",
  emptyActive: "该分店没有有效的EPC。",
  emptyFiltered: "没有匹配的EPC。",
  moreRows: "……共{{n}}条——请用搜索缩小范围",

  successInfo: "{{type}}成功：{{n}}个EPC · {{total}}₮",
  pendingSuffix: "（等待接收）",
  receiveConfirm: "在“{{branch}}”分店接收{{n}}个EPC吗？",
  receiveSuccess: "调拨已接收——EPC已在目标分店变为有效。",
  cancelConfirm: "取消调拨吗？{{n}}个EPC将在原分店恢复为有效。",
  cancelSuccess: "调拨已取消——EPC已退回原分店。",

  noBranch: "（无分店）",
  colWho: "操作人",
  colReceipt: "接收",
  noTransactions: "暂无交易。",
  receive: "接收",
};
