export default {
  // Ангиллын түвшний нэрс (lib/catalog.ts CATEGORY_LEVELS)
  levelMain: "主分类",
  levelSub: "子分类",
  levelItem: "商品分类",
  deleteCategoryBlocked: "该分类（或其下的子分类）中已登记商品，无法删除。请先将商品移至其他分类或删除。",

  // Catalog.tsx — толгой хэсэг
  title: "分类与属性",
  intro: "分类共有3个层级（{{levels}}），无需全部填写。属性（颜色/尺码/价格…）在一个全局列表中定义。",

  // Ангиллын мод
  confirmDeleteCategoryWithChildren: "“{{name}}”及其下的所有子分类将被删除。是否继续？",
  confirmDeleteCategory: "分类“{{name}}”将被删除。是否继续？",
  addLevelTitle: "添加{{level}}",
  renameTitle: "重命名",
  levelNamePlaceholder: "{{level}}名称",
  noCategories: "暂无分类。点击“+ {{level}}”开始。",

  // Шинж чанарын хэсэг
  attrsGlobalTitle: "属性（全局）",
  attrsGlobalDesc: "此处定义的属性适用于所有产品。创建产品时将显示这些字段。",
  confirmDeleteAttr: "删除属性“{{label}}”？",
  noAttrs: "暂无属性。",
  requiredBadge: "必填",
  addAttr: "+ 添加属性",

  // Шинж чанарын форм
  selectNeedsOption: "选择类型至少需要输入一个选项（用逗号分隔）。",
  typeText: "文本",
  typeNumber: "数字",
  typeSelect: "选择",
  typeSelectDropdown: "选择（下拉）",
  typeLabel: "类型",
  attrNamePlaceholder: "颜色",
  optionsLabel: "选项（用逗号分隔）",
  optionsPlaceholder: "红色, 蓝色, 绿色",
  requiredLabel: "必填",
  cancel: "取消",
  saving: "保存中…",
};
