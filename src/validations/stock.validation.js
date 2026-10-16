const { body } = require('express-validator');
const { validate } = require('./common.validation');
const { TXN_TYPES, BARCODE_TYPES, LABEL_LAYOUTS } = require('../config/constants');

const dateField = (f) => body(f).optional({ values: 'falsy' }).isISO8601({ strict: true }).withMessage(`${f} must be YYYY-MM-DD`);

// Structure only - stock rules (enough stock, unit status, serials...) are checked in the stock service
const transactionRules = [
  body('txn_type').isIn(TXN_TYPES).withMessage(`txn_type must be one of ${TXN_TYPES.join(', ')}`),
  body('location_id').isInt({ min: 1 }).withMessage('location_id is required'),
  body('to_location_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('supplier_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('customer_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  dateField('txn_date'),
  body('items').optional().isArray().withMessage('items must be an array'),
  body('unit_barcodes').optional().isArray().withMessage('unit_barcodes must be an array'),
  body('items.*.unit_barcodes').optional().isArray(),
  body('items.*.serials').optional().isArray(),
  body('items.*.quantity').optional({ values: 'null' }).isNumeric().withMessage('quantity must be a number'),
  body('items.*.counted_quantity').optional({ values: 'null' }).isNumeric().withMessage('counted_quantity must be a number'),
  validate,
];

const scanRules = [
  body('code').trim().notEmpty().withMessage('code (the scanned barcode) is required'),
  body('action').isIn(['in', 'out']).withMessage("action must be 'in' or 'out'"),
  body('location_id').isInt({ min: 1 }).withMessage('location_id is required'),
  body('quantity').optional({ values: 'null' }).isNumeric().withMessage('quantity must be a number'),
  dateField('txn_date'),
  validate,
];

const labelRules = [
  body('layout').optional().isIn(Object.keys(LABEL_LAYOUTS)).withMessage(`layout must be one of ${Object.keys(LABEL_LAYOUTS).join(', ')}`),
  body('type').optional().isIn(BARCODE_TYPES).withMessage(`type must be one of ${BARCODE_TYPES.join(', ')}`),
  body('products').optional().isArray(),
  body('products.*.product_id').optional().isInt({ min: 1 }),
  body('products.*.copies').optional().isInt({ min: 1, max: 500 }).withMessage('copies must be 1-500'),
  body('unit_ids').optional().isArray(),
  body('unit_barcodes').optional().isArray(),
  body('transaction_id').optional({ values: 'falsy' }).isInt({ min: 1 }),
  body('start_position').optional().isInt({ min: 1, max: 100 }),
  validate,
];

module.exports = { transactionRules, scanRules, labelRules };
