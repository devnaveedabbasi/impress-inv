export interface NavItem {
  label: string;
  href?: string;
  children?: NavItem[];
}

export const NAV_ITEMS: NavItem[] = [
  {
    label: "Master Enter Registration",
    children: [
      { label: "Category", href: "/master/categories" },
      { label: "City", href: "/master/cities" },
      { label: "Province", href: "/master/provinces" },
      { label: "Station", href: "/master/stations" },
      { label: "Dealer", href: "/master/dealers" },
      { label: "Vendor", href: "/master/vendors" },
      { label: "Department", href: "/master/departments" },
      { label: "Account Code", href: "/master/account-codes" },
    ],
  },
  {
    label: "Store Department",
    children: [
      { label: "Inward Quality Control", href: "/store/inward-quality-control" },
      { label: "Inward Quality Control Report", href: "/store/inward-quality-control-report" },
      { label: "Gate Pass for Sold Item", href: "/store/gate-pass-sold-item" },
      { label: "Rejection Return to Vendor", href: "/store/rejection-return-to-vendor" },
      { label: "Rejection Received from Dealer", href: "/store/rejection-received-from-dealer" },
      { label: "Issue from Line", href: "/store/issue-from-line" },
      { label: "Item Return from Department", href: "/store/item-return-from-department" },
      { label: "Transfer Form", href: "/store/transfer-form" },
      {
        label: "Report",
        children: [
          { label: "Issue Report", href: "/store/reports/issue" },
          { label: "Stock Ledger", href: "/store/reports/stock-ledger" },
          { label: "Item Ledger", href: "/store/reports/item-ledger" },
          { label: "Stock Register", href: "/store/reports/stock-register" },
          { label: "Shortage Report", href: "/store/reports/shortage" },
        ],
      },
    ],
  },
  { label: "Purchase Department", 
   children: [
    { label: "Purchase Order", href: "/purchase/purchase-order" },
    { label: "Purchase Invoice", href: "/purchase/purchase-invoice" },
  ] },
  { label: "Paint Shop Dept", children: [
    { label: "Paint Shop Inward", href: "/paint-shop/paint-shop-inward" },
    { label: "Paint Shop Outward", href: "/paint-shop/paint-shop-outward" },
  ] },
  { label: "Dispatch Department", children: [
    { label: "Dispatch Inward", href: "/dispatch/dispatch-inward" },
    { label: "Dispatch Outward", href: "/dispatch/dispatch-outward" },
  ] },
  { label: "Sales Department", children: [
    { label: "Sales Order", href: "/sales/sales-order" },
    { label: "Sales Invoice", href: "/sales/sales-invoice" },
  ] },
  {
    label: "Account Department",
    children: [
      { label: "Users", href: "/account-department/add-user" },
      { label: "Roles", href: "/account-department/add-role" },
      { label: "Permissions", href: "/account-department/permissions" },
    ],
  },
  { label: "Window",
    children: [
      { label: "Window 1", href: "/window/window1" },
      { label: "Window 2", href: "/window/window2" },
    ],
   },
];
