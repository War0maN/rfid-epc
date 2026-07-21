// Products (master) — ProductList / ProductForm / lib/products / lib/createProduct.
export default {
  // ProductList — багана
  colCat1: "Main category",
  colCat2: "Subcategory",
  colCat3: "Product category",
  colGtin: "GTIN/barcode",
  colStock: "Stock",
  // ProductList — толгой хэсэг
  subtitle: 'Register your products here. Generate EPCs later by quantity via "Generate EPC".',
  filtered: "Filtered",
  columnsBtn: "Columns",
  visibleColumns: "Visible columns",
  addProduct: "+ Add product",
  // ProductList — хүснэгт
  filterPlaceholder: "Filter…",
  emptyNoProducts: 'No products yet. Click "+ Add product" to start.',
  emptyNoMatch: "No matching products.",
  generateEpc: "Generate EPC",
  page: "Page",
  // ProductList — мессежүүд
  deleteBlocked:
    '"{{name}}" has {{epcCount}} EPCs registered and cannot be deleted. Delete the related Job first to clear the EPCs.',
  confirmDelete: 'Delete product "{{name}}"?',
  qtyRequired: "Enter a quantity.",
  generatedInfo: 'Generated {{epcCount}} EPCs for "{{name}}".',
  // ProductList — модалууд
  addProductTitle: "Add product",
  editProductTitle: "Edit product",
  genQuestion: "how many EPCs to generate?",
  genCurrent: "currently {{epcCount}} pcs",
  quantity: "Quantity",
  dismiss: "Cancel",
  generating: "Generating…",
  generate: "Generate",
  // ProductForm
  attrRequired: '"{{label}}" is required.',
  nameLabel: "Product name",
  namePlaceholder: "Shirt",
  skuLabel: "SKU / code",
  optionalPlaceholder: "Optional",
  gtinLabel: "GTIN / barcode",
  gtinPlaceholder: "Optional (SGTIN-96 if provided)",
  attributesTitle: "Attributes",
  selectOption: "— Select —",
  extraAttrsTitle: "Extra attributes",
  extraAttrsHint: "Attributes not in the list are registered automatically when added.",
  valuePlaceholder: "Value",
  saving: "Saving…",
  createProduct: "Create product",
  // lib/products.ts
  deleteBlockedFk:
    "This product has EPCs registered and cannot be deleted. Delete the related Job first to clear the EPCs (it can be deleted once the stock reaches 0).",
  // lib/createProduct.ts
  nameRequired: "Enter a product name.",
  qtyMin: "Quantity must be at least 1.",
  jobNumberBusy: "Could not allocate a job number — please try again.",
};
