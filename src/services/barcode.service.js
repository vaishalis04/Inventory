const bwipjs = require('bwip-js');
const { Op } = require('sequelize');
const { Product, StockUnit, StockLevel, Location } = require('../models');
const ApiError = require('../utils/ApiError');
const { allocate } = require('./documentNumber.service');
const { todayStr } = require('../utils/helpers');
const { BARCODE_TYPES, DEFAULT_BARCODE_TYPE } = require('../config/constants');

// ---------------------------------------------------------------- numbering

const formatCode = (prefix, n, padding) => `${prefix}${String(n).padStart(padding, '0')}`;

// Next free product barcode, e.g. P000123. Skips a value if a hand-typed barcode already took it.
const nextProductBarcode = async (company, transaction) => {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const { first } = await allocate(company, { key: 'product_barcode', date: todayStr(), yearly: false, transaction });
    const code = formatCode(company.barcode_prefix || 'P', first, company.barcode_padding || 6);
    const clash = await Promise.all([
      Product.findOne({ where: { company_id: company.id, barcode: code }, transaction }),
      StockUnit.findOne({ where: { company_id: company.id, barcode: code }, transaction }),
    ]);
    if (!clash[0] && !clash[1]) return code;
  }
  throw new ApiError(500, 'Could not find a free product barcode - check barcode_prefix in company settings');
};

// A block of `count` unit barcodes, e.g. U0000457 ... U0000466
const nextUnitBarcodes = async (company, count, transaction) => {
  const { first, last } = await allocate(company, { key: 'unit_barcode', date: todayStr(), count, yearly: false, transaction });
  const padding = Math.max(company.barcode_padding || 6, 7);
  const codes = [];
  for (let n = first; n <= last; n += 1) codes.push(formatCode(company.unit_barcode_prefix || 'U', n, padding));
  const clash = await Product.findOne({ where: { company_id: company.id, barcode: { [Op.in]: codes } }, transaction });
  if (clash) throw new ApiError(409, `Unit barcode ${clash.barcode} is already used by a product - change unit_barcode_prefix in company settings`);
  return codes;
};

// A hand-typed / manufacturer barcode must not clash with a product or with any unit label
const assertBarcodeFree = async (companyId, code, { exceptProductId = null, transaction } = {}) => {
  const product = await Product.findOne({ where: { company_id: companyId, barcode: code }, transaction });
  if (product && String(product.id) !== String(exceptProductId)) throw new ApiError(400, `Barcode "${code}" is already used by product "${product.name}"`);
  const unit = await StockUnit.findOne({ where: { company_id: companyId, barcode: code }, transaction });
  if (unit) throw new ApiError(400, `Barcode "${code}" is already used by a stock unit`);
};

// ---------------------------------------------------------------- scan lookup

// A scanned value can be: a unit label, a product label (or manufacturer EAN), a manufacturer serial number or an SKU.
const resolveCode = async (companyId, rawCode) => {
  const code = String(rawCode || '').trim();
  if (!code) return null;

  const unitInclude = [{ model: Product, as: 'product' }];
  let unit = await StockUnit.findOne({ where: { company_id: companyId, barcode: code }, include: unitInclude });
  if (unit) return { type: 'unit', matched_by: 'barcode', unit, product: unit.product };

  let product = await Product.findOne({ where: { company_id: companyId, barcode: code, is_deleted: false } });
  if (product) return { type: 'product', matched_by: 'barcode', product, unit: null };

  const bySerial = await StockUnit.findAll({ where: { company_id: companyId, serial_no: code }, include: unitInclude, limit: 2 });
  if (bySerial.length === 1) return { type: 'unit', matched_by: 'serial_no', unit: bySerial[0], product: bySerial[0].product };
  if (bySerial.length > 1) throw new ApiError(409, `Serial number "${code}" exists on more than one product - scan the unit barcode label instead`);

  product = await Product.findOne({ where: { company_id: companyId, sku: code, is_deleted: false } });
  if (product) return { type: 'product', matched_by: 'sku', product, unit: null };
  return null;
};

// Lookup result with stock figures, for the "scan to see" screen
const describeCode = async (companyId, rawCode) => {
  const hit = await resolveCode(companyId, rawCode);
  if (!hit) return null;
  const levels = await StockLevel.findAll({
    where: { company_id: companyId, product_id: hit.product.id },
    include: [{ model: Location, as: 'location', attributes: ['id', 'name', 'code'] }],
  });
  const stock = levels.map((l) => ({ location_id: l.location_id, location: l.location?.name, quantity: l.quantity }));
  return {
    type: hit.type,
    matched_by: hit.matched_by,
    product: hit.product,
    unit: hit.unit ? (() => { const j = hit.unit.toJSON(); delete j.product; return j; })() : null,
    stock,
    total_stock: stock.reduce((a, s) => a + s.quantity, 0),
  };
};

// ---------------------------------------------------------------- rendering

const normaliseType = (type) => {
  const t = String(type || DEFAULT_BARCODE_TYPE).toLowerCase();
  if (!BARCODE_TYPES.includes(t)) throw new ApiError(400, `Barcode type must be one of ${BARCODE_TYPES.join(', ')}`);
  return t;
};

const bwipOptions = (text, { type, scale = 3, height = 12, includeText = true } = {}) => {
  const bcid = normaliseType(type);
  const is2d = bcid === 'qrcode' || bcid === 'datamatrix';
  return {
    bcid,
    text: String(text),
    scale: Math.min(Math.max(Number(scale) || 3, 1), 10),
    ...(is2d ? {} : { height: Math.min(Math.max(Number(height) || 12, 4), 60), includetext: includeText, textxalign: 'center' }),
    paddingwidth: 2,
    paddingheight: 2,
  };
};

const wrapError = (err, text, type) => {
  if (err instanceof ApiError) return err;
  return new ApiError(400, `"${text}" cannot be encoded as ${type || DEFAULT_BARCODE_TYPE}: ${String(err.message || err).split('\n')[0]}`);
};

const renderPng = async (text, opts = {}) => {
  try {
    return await bwipjs.toBuffer(bwipOptions(text, opts));
  } catch (err) {
    throw wrapError(err, text, opts.type);
  }
};

const renderSvg = (text, opts = {}) => {
  try {
    return bwipjs.toSVG(bwipOptions(text, opts));
  } catch (err) {
    throw wrapError(err, text, opts.type);
  }
};

module.exports = {
  nextProductBarcode, nextUnitBarcodes, assertBarcodeFree, resolveCode, describeCode,
  renderPng, renderSvg, normaliseType,
};
