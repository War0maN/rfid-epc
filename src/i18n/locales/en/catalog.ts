export default {
  // Ангиллын түвшний нэрс (lib/catalog.ts CATEGORY_LEVELS)
  levelMain: "Main category",
  levelSub: "Subcategory",
  levelItem: "Item category",
  deleteCategoryBlocked:
    "This category (or a subcategory under it) has items registered, so it cannot be deleted. Move the items to another category or delete them first.",

  // Catalog.tsx — толгой хэсэг
  title: "Categories and attributes",
  intro:
    "Categories have 3 levels ({{levels}}) — filling all of them is optional. Attributes (color/size/price…) are defined in a single global list.",

  // Ангиллын мод
  confirmDeleteCategoryWithChildren: '"{{name}}" and all subcategories under it will be deleted. Continue?',
  confirmDeleteCategory: 'The category "{{name}}" will be deleted. Continue?',
  addLevelTitle: "Add {{level}}",
  renameTitle: "Rename",
  levelNamePlaceholder: "{{level}} name",
  noCategories: 'No categories yet. Click "+ {{level}}" to start.',
  searchPlaceholder: "Search categories…",
  expandAll: "Expand all",
  collapseAll: "Collapse all",
  noMatches: "No categories match your search.",

  // Шинж чанарын хэсэг
  attrsGlobalTitle: "Attributes (global)",
  attrsGlobalDesc: "Attributes defined here apply to all products. These fields appear when creating a product.",
  confirmDeleteAttr: 'Delete attribute "{{label}}"?',
  noAttrs: "No attributes.",
  requiredBadge: "required",
  addAttr: "+ Add attribute",

  // Шинж чанарын форм
  selectNeedsOption: "For the select type, enter at least one option (comma-separated).",
  typeText: "Text",
  typeNumber: "Number",
  typeSelect: "Select",
  typeSelectDropdown: "Select (dropdown)",
  typeLabel: "Type",
  attrNamePlaceholder: "Color",
  optionsLabel: "Options (comma-separated)",
  optionsPlaceholder: "Red, Blue, Green",
  requiredLabel: "Required",
  cancel: "Cancel",
  saving: "Saving…",
};
