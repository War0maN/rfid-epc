// EPC 表格（EpcTable）— 列、批量操作、弹窗、CSV 表头。
export default {
  // 列标题（表格 + CSV 导出）
  colEpcHex: "EPC (hex)",
  colSerial: "序列号",
  colCat1: "主分类",
  colCat2: "子分类",
  colCat3: "商品分类",
  colGtin: "GTIN/条码",
  colBox: "箱号",
  colJob: "任务编号",
  colDate: "到货日期",
  colSupplier: "供应商",
  colCreated: "创建时间",
  csvEpcUri: "EPC URI",
  csvEpcTagUri: "EPC Tag URI",

  // 操作栏
  filtered: "已筛选",
  columns: "列",
  visibleColumns: "显示的列",
  clearFilters: "清除筛选",
  exportCsvN: "导出 CSV（{{n}}）",
  printN: "打印（{{n}}）",
  changeStatusTitle: "更改所选（或所有符合筛选条件的）EPC 的状态",
  changeStatusN: "更改状态（{{n}}）…",
  deleteN: "删除（{{n}}）",
  clearSelectionN: "清除选择（{{n}}）",
  preparing: "准备中…",

  // 表格
  selectPageAll: "全选本页",
  sort: "排序",
  filterPlaceholder: "筛选…",
  loadingEpcData: "正在加载 EPC 数据…",
  noFilterMatch: "没有符合筛选条件的行。",
  noEpc: "暂无 EPC。",
  printedAt: "打印时间：{{date}}",
  viewHistory: "查看历史",
  page: "页",

  // 错误 / 提示
  noRowsToChange: "没有可更改状态的行。",
  noRowsToPrint: "没有可打印的行。",
  deleteResult:
    "已删除 {{deleted}} 个 EPC。已跳过：{{hist}} 个有交易记录、{{status}} 个非未打印状态（受保护）。",
  deleteFkProtected: "部分 EPC 因有交易记录或处于受保护状态而无法删除。",

  // 删除确认弹窗——仅可删除未打印状态
  deleteTitle: "删除 EPC",
  deleteBody: "所选 <b>{{selected}}</b> 个 EPC 中，将删除 <r>{{deletable}}</r> 个（未打印）。",
  deleteBodyFiltered: "符合筛选的 <b>{{n}}</b> 个 EPC 中，仅<r>未打印</r>状态的会被删除。",
  deleteProtectedNote:
    "{{n}} 个非未打印状态受保护——不会被删除。（已激活的 EPC 视为有流转记录；如确需删除，请先将其改回未打印。）",
  deleteSkipNote: "注：有交易记录的 EPC（例如曾被售出）会被自动跳过。",
  deleteConfirm: "确定吗？此操作无法撤销。",
  nothingDeletable: "没有可删除的 EPC。",
  dismiss: "取消",

  // 更改状态弹窗
  statusTitle: "更改状态",
  statusBodySelected: "将所选 <b>{{n}}</b> 个 EPC 的状态更改为 <s>{{status}}</s>。",
  statusBodyFiltered: "将符合筛选条件的 <b>{{n}}</b> 个 EPC 的状态更改为 <s>{{status}}</s>。",
  notePlaceholder: "例如：报废、丢失…",
  change: "更改",
};
