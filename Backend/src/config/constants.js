module.exports = {
  ROLES: {
    SUPER_ADMIN: 'super_admin',
    ADMIN: 'company_admin',
    MANAGER: 'manager',         // manages masters (products, categories...) and all stock work
    STOREKEEPER: 'storekeeper', // stock in / out / transfer / scan, cannot edit masters, cannot see purchase prices
    VIEWER: 'viewer',           // read only
  },
  // who may edit masters / see purchase prices / do stock work
  MANAGE_ROLES: ['super_admin', 'company_admin', 'manager'],
  STOCK_ROLES: ['super_admin', 'company_admin', 'manager', 'storekeeper'],
  COST_VISIBLE_ROLES: ['super_admin', 'company_admin', 'manager'],

  BUSINESS_TYPES: ['cctv', 'security', 'it', 'electrical', 'other'],

  // quantity = counted in numbers/metres (cables, connectors, sockets, SMPS)
  // serial   = every piece is tracked one by one with its own barcode label (cameras, NVR/DVR, HDD)
  TRACKING_TYPES: ['quantity', 'serial'],

  // suggestions for the UI - the unit column is free text
  UNITS: ['Nos', 'Mtr', 'Box', 'Roll', 'Pair', 'Set', 'Kg', 'Pkt'],

  TXN_TYPES: ['in', 'out', 'transfer', 'adjustment'],
  DOC_PREFIX: { in: 'IN', out: 'OUT', transfer: 'TRF', adjustment: 'ADJ' },

  REASONS: {
    in: ['purchase', 'opening_stock', 'customer_return', 'other_in'],
    out: ['sale', 'site_issue', 'internal_use', 'supplier_return', 'damage', 'lost', 'other_out'],
    transfer: ['transfer'],
    adjustment: ['stock_count'],
  },
  DEFAULT_REASON: { in: 'purchase', out: 'sale', transfer: 'transfer', adjustment: 'stock_count' },

  // what happens to a serialised unit when it leaves stock for a given reason
  UNIT_STATUS: ['in_stock', 'issued', 'damaged', 'lost', 'returned_to_supplier'],
  OUT_UNIT_STATUS: {
    sale: 'issued', site_issue: 'issued', internal_use: 'issued', other_out: 'issued',
    supplier_return: 'returned_to_supplier', damage: 'damaged', lost: 'lost',
  },
  // warranty starts when the unit goes to the customer
  WARRANTY_START_REASONS: ['sale', 'site_issue'],

  BARCODE_TYPES: ['code128', 'code39', 'ean13', 'qrcode', 'datamatrix'],
  DEFAULT_BARCODE_TYPE: 'code128',

  // Label sheets. Sizes in mm. Grids are centred on the A4 page, thermal layouts make the page the size of one label.
  LABEL_LAYOUTS: {
    a4_3x7: { description: 'A4 sheet, 3 x 7 labels of 63.5 x 38.1 mm (21 per sheet)', page: 'A4', cols: 3, rows: 7, label_w: 63.5, label_h: 38.1, gap_x: 2.5, gap_y: 0 },
    a4_5x13: { description: 'A4 sheet, 5 x 13 small labels of 38.1 x 21.2 mm (65 per sheet)', page: 'A4', cols: 5, rows: 13, label_w: 38.1, label_h: 21.2, gap_x: 2.5, gap_y: 0 },
    a4_2x5: { description: 'A4 sheet, 2 x 5 big labels of 99.1 x 57 mm (10 per sheet)', page: 'A4', cols: 2, rows: 5, label_w: 99.1, label_h: 57, gap_x: 2.5, gap_y: 0 },
    thermal_50x25: { description: 'Thermal roll, one 50 x 25 mm label per page', page: 'custom', cols: 1, rows: 1, label_w: 50, label_h: 25, gap_x: 0, gap_y: 0 },
    thermal_75x50: { description: 'Thermal roll, one 75 x 50 mm label per page', page: 'custom', cols: 1, rows: 1, label_w: 75, label_h: 50, gap_x: 0, gap_y: 0 },
  },
  DEFAULT_LABEL_LAYOUT: 'a4_3x7',
  MAX_LABELS_PER_REQUEST: 500,

  TIMEZONE: process.env.APP_TIMEZONE || 'Asia/Kolkata',

  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};
