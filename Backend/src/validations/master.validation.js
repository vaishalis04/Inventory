const { body } = require('express-validator');
const { validate } = require('./common.validation');
const { BUSINESS_TYPES, TRACKING_TYPES, BARCODE_TYPES } = require('../config/constants');

const isCreate = (v, { req }) => req.method === 'POST';
const required = (field, label) =>
  body(field).if((v, { req }) => req.method === 'POST' || req.body[field] !== undefined).trim().notEmpty().withMessage(`${label} is required`);

const optionalGstin = body('gstin').optional({ values: 'falsy' }).trim().toUpperCase()
  .matches(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/).withMessage('GSTIN format is not valid');

const companyRules = [
  body('name').optional().trim().notEmpty().withMessage('Company name cannot be empty'),
  body('business_type').optional().isIn(BUSINESS_TYPES).withMessage(`business_type must be one of ${BUSINESS_TYPES.join(', ')}`),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email is required'),
  optionalGstin,
  body('barcode_prefix').optional().trim().matches(/^[A-Za-z0-9]{1,6}$/).withMessage('barcode_prefix: 1-6 letters/digits'),
  body('unit_barcode_prefix').optional().trim().matches(/^[A-Za-z0-9]{1,6}$/).withMessage('unit_barcode_prefix: 1-6 letters/digits'),
  body('barcode_padding').optional().isInt({ min: 3, max: 10 }).withMessage('barcode_padding must be 3-10'),
  body('default_barcode_type').optional().isIn(BARCODE_TYPES).withMessage(`default_barcode_type must be one of ${BARCODE_TYPES.join(', ')}`),
  body('allow_negative_stock').optional().isBoolean(),
  body('doc_number_padding').optional().isInt({ min: 1, max: 8 }),
  validate,
];

const createCompanyRules = [
  body('name').trim().notEmpty().withMessage('Company name is required'),
  ...companyRules.slice(1, -1),
  body('admin_name').optional().trim().notEmpty(),
  body('admin_email').optional().isEmail().withMessage('Valid admin_email is required'),
  body('admin_password').optional().isLength({ min: 8 }).withMessage('admin_password must be at least 8 characters'),
  validate,
];

const categoryRules = [
  required('name', 'Category name'),
  body('parent_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('parent_id must be a category id'),
  validate,
];

const locationRules = [
  required('name', 'Location name'),
  body('code').optional({ values: 'falsy' }).trim().isLength({ max: 20 }),
  body('is_default').optional().isBoolean(),
  validate,
];

const partyRules = [
  required('name', 'Name'),
  body('email').optional({ values: 'falsy' }).isEmail().withMessage('Valid email is required'),
  optionalGstin,
  validate,
];

const priceField = (f) => body(f).optional({ values: 'null' }).isFloat({ min: 0 }).withMessage(`${f} must be 0 or more`);

const productRules = [
  required('name', 'Product name'),
  body('category_id').optional({ values: 'null' }).isInt({ min: 1 }).withMessage('category_id must be a category id'),
  body('tracking_type').optional().isIn(TRACKING_TYPES).withMessage(`tracking_type must be one of ${TRACKING_TYPES.join(', ')}`),
  body('barcode').optional({ values: 'falsy' }).trim().isLength({ min: 3, max: 64 }).withMessage('barcode must be 3-64 characters'),
  priceField('cost_price'), priceField('selling_price'), priceField('mrp'),
  body('gst_rate').optional().isFloat({ min: 0, max: 100 }).withMessage('gst_rate must be between 0 and 100'),
  body('reorder_level').optional().isFloat({ min: 0 }).withMessage('reorder_level must be 0 or more'),
  body('warranty_months').optional({ values: 'null' }).isInt({ min: 0, max: 240 }).withMessage('warranty_months must be 0-240'),
  body('hsn_code').optional({ values: 'falsy' }).matches(/^[0-9]{4,8}$/).withMessage('HSN must be 4 to 8 digits'),
  body('specs').optional({ values: 'null' }).isObject().withMessage('specs must be an object of key/value pairs'),
  validate,
];

module.exports = { companyRules, createCompanyRules, categoryRules, locationRules, partyRules, productRules, isCreate };
