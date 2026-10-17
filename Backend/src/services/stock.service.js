const Decimal = require('decimal.js');
const moment = require('moment-timezone');
const { Op } = require('sequelize');
const {
  sequelize, Company, User, Product, Location, Supplier, Customer, StockLevel, StockUnit,
  StockTransaction, StockTransactionItem, StockMovement,
} = require('../models');
const ApiError = require('../utils/ApiError');
const { todayStr, canSeeCost } = require('../utils/helpers');
const { allocate, docNumber } = require('./documentNumber.service');
const { nextUnitBarcodes } = require('./barcode.service');
const { REASONS, DEFAULT_REASON, DOC_PREFIX, OUT_UNIT_STATUS, WARRANTY_START_REASONS } = require('../config/constants');

/*
 * All stock changes go through createTransaction(). One request = one DB transaction:
 *   header (IN/OUT/TRF/ADJ number) -> lines -> stock level rows (row-locked) -> ledger rows -> unit rows.
 * Either everything is saved or nothing is. Posted documents are never edited; fix a mistake with a new document.
 */

// ---------------------------------------------------------------- small helpers

// positive quantity with at most 3 decimals; serial products must be whole numbers
const parseQty = (value, label, { integer = false, allowZero = false } = {}) => {
  let d;
  try { d = new Decimal(value); } catch { throw new ApiError(400, `${label}: quantity must be a number`); }
  if (!d.isFinite()) throw new ApiError(400, `${label}: quantity must be a number`);
  if (d.isNegative() || (!allowZero && d.isZero())) throw new ApiError(400, `${label}: quantity must be greater than 0`);
  if (d.decimalPlaces() > 3) throw new ApiError(400, `${label}: quantity can have at most 3 decimal places`);
  if (integer && !d.isInteger()) throw new ApiError(400, `${label} is tracked piece by piece, so quantity must be a whole number`);
  return d;
};

const parseCost = (value) => {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) throw new ApiError(400, 'unit_cost must be 0 or more');
  return n;
};

const findMaster = async (Model, companyId, id, label, transaction) => {
  const row = await Model.findOne({ where: { id, company_id: companyId, is_deleted: false }, transaction });
  if (!row) throw new ApiError(404, `${label} not found`);
  return row;
};

const lockedLevel = async (t, companyId, productId, locationId) => {
  const where = { company_id: companyId, product_id: productId, location_id: locationId };
  const opts = { where, transaction: t, lock: t.LOCK.UPDATE };
  let level = await StockLevel.findOne(opts);
  if (!level) {
    try {
      level = await StockLevel.create({ ...where, quantity: 0 }, { transaction: t });
    } catch (err) {
      level = await StockLevel.findOne(opts); // another request created it first
      if (!level) throw err;
    }
  }
  return level;
};

// ---------------------------------------------------------------- the one place stock numbers change

// Moves one product at one location up or down and writes the ledger row. Returns the new balance.
const record = async (ctx, { product, location, direction, quantity, unit = null, item = null, unitCost = null, reason = ctx.reason }) => {
  const { t, company } = ctx;
  const level = await lockedLevel(t, company.id, product.id, location.id);
  const before = new Decimal(level.quantity);
  const after = direction === 'in' ? before.plus(quantity) : before.minus(quantity);
  if (after.isNegative() && !company.allow_negative_stock) {
    throw new ApiError(400, `Not enough stock of "${product.name}" at ${location.name}: available ${before.toString()}, needed ${quantity.toString()}`);
  }
  await level.update({ quantity: after.toFixed(3) }, { transaction: t });
  await StockMovement.create({
    company_id: company.id, product_id: product.id, location_id: location.id, unit_id: unit ? unit.id : null,
    transaction_id: ctx.txn.id, transaction_item_id: item ? item.id : null, movement_date: ctx.txnDate,
    direction, reason, quantity: quantity.toFixed(3), balance_after: after.toFixed(3), unit_cost: unitCost,
    performed_by: ctx.user.id,
  }, { transaction: t });
  return after;
};

// ---------------------------------------------------------------- unit helpers

const loadUnits = async (ctx, product, barcodes) => {
  const cleaned = barcodes.map((b) => String(b).trim()).filter(Boolean);
  const unique = [...new Set(cleaned)];
  if (unique.length !== cleaned.length) throw new ApiError(400, `"${product.name}": the same unit barcode was sent twice`);
  const units = await StockUnit.findAll({
    where: { company_id: ctx.company.id, product_id: product.id, barcode: { [Op.in]: unique } },
    transaction: ctx.t, lock: ctx.t.LOCK.UPDATE,
  });
  const byCode = new Map(units.map((u) => [u.barcode, u]));
  const missing = unique.filter((b) => !byCode.has(b));
  if (missing.length) throw new ApiError(400, `Unit barcode not found for "${product.name}": ${missing.join(', ')}`);
  return unique.map((b) => byCode.get(b));
};

const assertUnitsInStockAt = (units, location) => {
  const bad = units.filter((u) => u.status !== 'in_stock' || String(u.location_id) !== String(location.id));
  if (bad.length) {
    throw new ApiError(400, `Not in stock at ${location.name}: ${bad.map((u) => `${u.barcode} (${u.status === 'in_stock' ? 'at another location' : u.status})`).join(', ')}`);
  }
};

const warrantyExpiry = (product, txnDate) =>
  product.warranty_months ? moment(txnDate, 'YYYY-MM-DD').add(product.warranty_months, 'months').format('YYYY-MM-DD') : null;

// ---------------------------------------------------------------- line handlers

const handleIn = async (ctx, product, line, item) => {
  const unitCost = parseCost(line.unit_cost);
  const base = { product, location: ctx.location, direction: 'in', item, unitCost };

  if (product.tracking_type === 'quantity') {
    const qty = parseQty(line.quantity, product.name);
    await record(ctx, { ...base, quantity: qty });
    await item.update({ quantity: qty.toFixed(3), unit_cost: unitCost }, { transaction: ctx.t });
    if (ctx.reason === 'purchase' && unitCost !== null) await product.update({ last_purchase_price: unitCost }, { transaction: ctx.t });
    return;
  }

  // ---- serial-tracked
  if (ctx.reason === 'customer_return') {
    // the unit already exists; it comes back from a customer
    if (!Array.isArray(line.unit_barcodes) || !line.unit_barcodes.length) throw new ApiError(400, `"${product.name}": send unit_barcodes of the units being returned`);
    const units = await loadUnits(ctx, product, line.unit_barcodes);
    const bad = units.filter((u) => u.status !== 'issued');
    if (bad.length) throw new ApiError(400, `Only issued units can be returned by a customer: ${bad.map((u) => `${u.barcode} (${u.status})`).join(', ')}`);
    for (const u of units) {
      await u.update({ status: 'in_stock', location_id: ctx.location.id, customer_id: null, site_name: null, issued_at: null }, { transaction: ctx.t });
      await record(ctx, { ...base, quantity: new Decimal(1), unit: u });
    }
    await item.update({ quantity: String(units.length) }, { transaction: ctx.t });
    return;
  }

  // new units are created, each with its own barcode
  const serials = (line.serials || []).map((s) => String(s).trim()).filter(Boolean);
  if (serials.length && line.quantity !== undefined && line.quantity !== null && Number(line.quantity) !== serials.length) {
    throw new ApiError(400, `"${product.name}": quantity ${line.quantity} does not match the ${serials.length} serial numbers sent`);
  }
  const count = serials.length || Number(line.quantity);
  if (!Number.isInteger(count) || count < 1) throw new ApiError(400, `"${product.name}" is tracked piece by piece: send quantity as a whole number or a serials list`);
  if (count > 1000) throw new ApiError(400, `"${product.name}": at most 1000 units per line`);
  if (new Set(serials).size !== serials.length) throw new ApiError(400, `"${product.name}": a serial number appears twice in the list`);
  if (serials.length) {
    const dup = await StockUnit.findAll({ where: { company_id: ctx.company.id, product_id: product.id, serial_no: { [Op.in]: serials } }, transaction: ctx.t });
    if (dup.length) throw new ApiError(400, `Serial number already registered: ${dup.map((d) => d.serial_no).join(', ')}`);
  }

  const codes = await nextUnitBarcodes(ctx.company, count, ctx.t);
  for (let i = 0; i < count; i += 1) {
    const unit = await StockUnit.create({
      company_id: ctx.company.id, product_id: product.id, barcode: codes[i], serial_no: serials[i] || null,
      status: 'in_stock', location_id: ctx.location.id, supplier_id: ctx.supplier ? ctx.supplier.id : null,
      purchase_date: ctx.txnDate, purchase_cost: unitCost, in_transaction_id: ctx.txn.id,
    }, { transaction: ctx.t });
    await record(ctx, { ...base, quantity: new Decimal(1), unit });
  }
  await item.update({ quantity: String(count), unit_cost: unitCost }, { transaction: ctx.t });
  if (ctx.reason === 'purchase' && unitCost !== null) await product.update({ last_purchase_price: unitCost }, { transaction: ctx.t });
};

const handleOut = async (ctx, product, line, item) => {
  const base = { product, location: ctx.location, direction: 'out', item };

  if (product.tracking_type === 'quantity') {
    const qty = parseQty(line.quantity, product.name);
    await record(ctx, { ...base, quantity: qty });
    await item.update({ quantity: qty.toFixed(3) }, { transaction: ctx.t });
    return;
  }

  if (!Array.isArray(line.unit_barcodes) || !line.unit_barcodes.length) {
    throw new ApiError(400, `"${product.name}" is tracked piece by piece: scan or send the unit_barcodes that are leaving`);
  }
  if (line.quantity !== undefined && line.quantity !== null && Number(line.quantity) !== line.unit_barcodes.length) {
    throw new ApiError(400, `"${product.name}": quantity ${line.quantity} does not match the ${line.unit_barcodes.length} unit barcodes sent`);
  }
  const units = await loadUnits(ctx, product, line.unit_barcodes);
  assertUnitsInStockAt(units, ctx.location);

  const newStatus = OUT_UNIT_STATUS[ctx.reason];
  const warranty = WARRANTY_START_REASONS.includes(ctx.reason) ? warrantyExpiry(product, ctx.txnDate) : null;
  for (const u of units) {
    const patch = { status: newStatus };
    if (newStatus === 'issued') {
      Object.assign(patch, { customer_id: ctx.customer ? ctx.customer.id : null, site_name: ctx.txn.site_name, issued_at: ctx.txnDate });
      if (warranty) patch.warranty_expiry = warranty;
    }
    await u.update(patch, { transaction: ctx.t });
    await record(ctx, { ...base, quantity: new Decimal(1), unit: u });
  }
  await item.update({ quantity: String(units.length) }, { transaction: ctx.t });
};

const handleTransfer = async (ctx, product, line, item) => {
  const out = { product, location: ctx.location, direction: 'out', item };
  const inn = { product, location: ctx.toLocation, direction: 'in', item };

  if (product.tracking_type === 'quantity') {
    const qty = parseQty(line.quantity, product.name);
    await record(ctx, { ...out, quantity: qty });
    await record(ctx, { ...inn, quantity: qty });
    await item.update({ quantity: qty.toFixed(3) }, { transaction: ctx.t });
    return;
  }

  if (!Array.isArray(line.unit_barcodes) || !line.unit_barcodes.length) {
    throw new ApiError(400, `"${product.name}" is tracked piece by piece: send the unit_barcodes being moved`);
  }
  const units = await loadUnits(ctx, product, line.unit_barcodes);
  assertUnitsInStockAt(units, ctx.location);
  for (const u of units) {
    await u.update({ location_id: ctx.toLocation.id }, { transaction: ctx.t });
    await record(ctx, { ...out, quantity: new Decimal(1), unit: u });
    await record(ctx, { ...inn, quantity: new Decimal(1), unit: u });
  }
  await item.update({ quantity: String(units.length) }, { transaction: ctx.t });
};

// Stock count: the line says what was COUNTED; the difference to the system figure is booked.
const handleAdjustment = async (ctx, product, line, item) => {
  if (product.tracking_type === 'serial') {
    throw new ApiError(400, `"${product.name}" is tracked piece by piece - a missing or broken unit is booked with a stock-out (reason lost / damage) and its unit barcode`);
  }
  const counted = parseQty(line.counted_quantity, product.name, { allowZero: true });
  const level = await lockedLevel(ctx.t, ctx.company.id, product.id, ctx.location.id);
  const system = new Decimal(level.quantity);
  const diff = counted.minus(system);
  await item.update({ system_quantity: system.toFixed(3), counted_quantity: counted.toFixed(3), quantity: diff.abs().toFixed(3) }, { transaction: ctx.t });
  if (diff.isZero()) return;
  await record(ctx, { product, location: ctx.location, direction: diff.isPositive() ? 'in' : 'out', quantity: diff.abs(), item });
};

const HANDLERS = { in: handleIn, out: handleOut, transfer: handleTransfer, adjustment: handleAdjustment };

// ---------------------------------------------------------------- resolving lines

const resolveProduct = async (ctx, line) => {
  const where = { company_id: ctx.company.id, is_deleted: false };
  if (line.product_id) where.id = line.product_id;
  else if (line.barcode) where.barcode = String(line.barcode).trim();
  else if (Array.isArray(line.unit_barcodes) && line.unit_barcodes.length) {
    const unit = await StockUnit.findOne({ where: { company_id: ctx.company.id, barcode: String(line.unit_barcodes[0]).trim() }, transaction: ctx.t });
    if (!unit) throw new ApiError(404, `Unit barcode not found: ${line.unit_barcodes[0]}`);
    where.id = unit.product_id;
  } else {
    throw new ApiError(400, 'Each item needs a product_id, a product barcode or unit_barcodes');
  }
  const product = await Product.findOne({ where, transaction: ctx.t });
  if (!product) throw new ApiError(404, `Product not found (${line.product_id || line.barcode || line.unit_barcodes[0]})`);
  if (!product.is_active) throw new ApiError(400, `Product "${product.name}" is inactive`);
  return product;
};

// body.unit_barcodes = a flat list of scanned labels; group them into one line per product
const linesFromUnitBarcodes = async (ctx, barcodes) => {
  const cleaned = barcodes.map((b) => String(b).trim()).filter(Boolean);
  const units = await StockUnit.findAll({ where: { company_id: ctx.company.id, barcode: { [Op.in]: cleaned } }, transaction: ctx.t });
  const found = new Set(units.map((u) => u.barcode));
  const missing = [...new Set(cleaned)].filter((b) => !found.has(b));
  if (missing.length) throw new ApiError(400, `Unit barcode not found: ${missing.join(', ')}`);
  const groups = new Map();
  cleaned.forEach((code) => {
    const unit = units.find((u) => u.barcode === code);
    if (!groups.has(unit.product_id)) groups.set(unit.product_id, []);
    groups.get(unit.product_id).push(code);
  });
  return [...groups.entries()].map(([product_id, unit_barcodes]) => ({ product_id, unit_barcodes }));
};

// ---------------------------------------------------------------- create a stock document

/**
 * body: { txn_type, reason?, txn_date?, location_id, to_location_id? (transfer), supplier_id?, customer_id?,
 *         site_name?, reference_no?, notes?,
 *         items: [ { product_id | barcode | unit_barcodes, quantity, unit_cost, serials[], unit_barcodes[], counted_quantity } ],
 *         unit_barcodes?: [ ...scanned unit labels, any products ] }
 */
const createTransaction = async ({ companyId, user, body, source = 'manual' }) => {
  const type = body.txn_type;
  if (!REASONS[type]) throw new ApiError(400, 'Invalid txn_type');
  const reason = body.reason || DEFAULT_REASON[type];
  if (!REASONS[type].includes(reason)) throw new ApiError(400, `reason for '${type}' must be one of: ${REASONS[type].join(', ')}`);
  const txnDate = body.txn_date || todayStr();
  if (txnDate > todayStr()) throw new ApiError(400, 'Transaction date cannot be in the future');

  const txnId = await sequelize.transaction(async (t) => {
    const company = await Company.findOne({ where: { id: companyId, is_deleted: false }, transaction: t });
    if (!company) throw new ApiError(404, 'Company not found');

    const location = await findMaster(Location, companyId, body.location_id, 'Location', t);
    if (!location.is_active) throw new ApiError(400, `Location "${location.name}" is inactive`);
    let toLocation = null;
    if (type === 'transfer') {
      if (!body.to_location_id) throw new ApiError(400, 'to_location_id is required for a transfer');
      if (String(body.to_location_id) === String(location.id)) throw new ApiError(400, 'A transfer needs two different locations');
      toLocation = await findMaster(Location, companyId, body.to_location_id, 'Destination location', t);
      if (!toLocation.is_active) throw new ApiError(400, `Location "${toLocation.name}" is inactive`);
    }
    const supplier = body.supplier_id ? await findMaster(Supplier, companyId, body.supplier_id, 'Supplier', t) : null;
    const customer = body.customer_id ? await findMaster(Customer, companyId, body.customer_id, 'Customer', t) : null;

    const num = await allocate(company, { key: type, date: txnDate, transaction: t });
    const txn = await StockTransaction.create({
      company_id: companyId, txn_type: type, reason, financial_year: num.financial_year, sequence_no: num.first,
      txn_number: docNumber(DOC_PREFIX[type], num.financial_year, num.first, company.doc_number_padding || 4),
      txn_date: txnDate, location_id: location.id, to_location_id: toLocation ? toLocation.id : null,
      supplier_id: supplier ? supplier.id : null, customer_id: customer ? customer.id : null,
      site_name: body.site_name || null, reference_no: body.reference_no || null, source, notes: body.notes || null,
      created_by: user.id,
    }, { transaction: t });

    const ctx = { t, company, txn, txnDate, user, reason, location, toLocation, supplier, customer };

    let lines = Array.isArray(body.items) ? [...body.items] : [];
    if (Array.isArray(body.unit_barcodes) && body.unit_barcodes.length) lines = lines.concat(await linesFromUnitBarcodes(ctx, body.unit_barcodes));
    if (!lines.length) throw new ApiError(400, 'Add at least one item or unit barcode');
    if (lines.length > 200) throw new ApiError(400, 'At most 200 lines per document');

    for (const line of lines) {
      const product = await resolveProduct(ctx, line);
      const item = await StockTransactionItem.create({
        company_id: companyId, transaction_id: txn.id, product_id: product.id, quantity: 0, notes: line.notes || null,
      }, { transaction: t });
      await HANDLERS[type](ctx, product, line, item);
    }
    return txn.id;
  });

  return getTransaction(companyId, txnId);
};

// ---------------------------------------------------------------- reading a document

const getTransaction = (companyId, id) =>
  StockTransaction.findOne({
    where: { id, company_id: companyId },
    include: [
      { model: Location, as: 'location', attributes: ['id', 'name', 'code'] },
      { model: Location, as: 'to_location', attributes: ['id', 'name', 'code'] },
      { model: Supplier, as: 'supplier', attributes: ['id', 'name'] },
      { model: Customer, as: 'customer', attributes: ['id', 'name'] },
      { model: User, as: 'creator', attributes: ['id', 'name'] },
      {
        model: StockTransactionItem, as: 'items',
        include: [
          { model: Product, as: 'product', attributes: ['id', 'name', 'sku', 'barcode', 'unit', 'tracking_type'] },
          { model: StockMovement, as: 'movements', include: [{ model: StockUnit, as: 'unit', attributes: ['id', 'barcode', 'serial_no'] }] },
        ],
      },
    ],
    order: [[{ model: StockTransactionItem, as: 'items' }, 'id', 'ASC']],
  });

// JSON for the client: units touched per line instead of raw movements; purchase prices only for managers/admins
const presentTransaction = (txn, user) => {
  const j = txn.toJSON();
  j.items = (j.items || []).map((it) => {
    const seen = new Map();
    (it.movements || []).forEach((m) => { if (m.unit) seen.set(m.unit.id, m.unit); });
    const { movements, ...rest } = it;
    const out = { ...rest, units: [...seen.values()].sort((a, b) => Number(a.id) - Number(b.id)) };
    if (!canSeeCost(user)) delete out.unit_cost;
    return out;
  });
  return j;
};

module.exports = { createTransaction, getTransaction, presentTransaction, parseQty };
