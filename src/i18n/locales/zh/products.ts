// 产品（主档） — ProductList / ProductForm / lib/products / lib/createProduct.
export default {
  // ProductList — багана
  colCat1: "主分类",
  colCat2: "子分类",
  colCat3: "商品分类",
  colGtin: "GTIN/条码",
  colStock: "库存",
  // ProductList — толгой хэсэг
  subtitle: "在此登记商品。之后可通过“生成 EPC”按数量生成 EPC。",
  filtered: "筛选后",
  columnsBtn: "列",
  visibleColumns: "显示的列",
  addProduct: "+ 添加产品",
  // ProductList — хүснэгт
  filterPlaceholder: "筛选…",
  emptyNoProducts: "暂无产品。点击“+ 添加产品”开始。",
  emptyNoMatch: "没有符合条件的产品。",
  generateEpc: "生成 EPC",
  page: "页",
  // ProductList — мессежүүд
  deleteBlocked: "“{{name}}”已登记 {{epcCount}} 个 EPC，无法删除。请先删除相关任务以清除 EPC。",
  confirmDelete: "确定删除产品“{{name}}”吗？",
  qtyRequired: "请输入数量。",
  generatedInfo: "已为“{{name}}”生成 {{epcCount}} 个 EPC。",
  // ProductList — модалууд
  addProductTitle: "添加产品",
  editProductTitle: "编辑产品",
  genQuestion: "要生成多少个 EPC？",
  genCurrent: "当前 {{epcCount}} 个",
  quantity: "数量",
  dismiss: "取消",
  generating: "生成中…",
  generate: "生成",
  // ProductForm
  attrRequired: "“{{label}}”为必填项。",
  nameLabel: "产品名称",
  namePlaceholder: "衬衫",
  skuLabel: "SKU / 编码",
  optionalPlaceholder: "选填",
  gtinLabel: "GTIN / 条码",
  gtinPlaceholder: "选填（如有则为 SGTIN-96）",
  attributesTitle: "属性",
  selectOption: "— 请选择 —",
  extraAttrsTitle: "附加属性",
  extraAttrsHint: "添加列表中没有的属性时会自动登记。",
  valuePlaceholder: "值",
  saving: "保存中…",
  createProduct: "创建产品",
  // lib/products.ts
  deleteBlockedFk: "该产品已登记 EPC，无法删除。请先删除相关任务以清除 EPC（库存为 0 后方可删除）。",
  // lib/createProduct.ts
  nameRequired: "请输入产品名称。",
  qtyMin: "数量不得小于 1。",
  jobNumberBusy: "分配任务编号时发生冲突，请重试。",
};
