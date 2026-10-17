const { Op } = require("sequelize");
const {
  StockTransaction, StockLevel, StockMovement, StockUnit, Product, Location, Supplier, Customer, User,
} = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, requireCompanyId, getPagination, paginationMeta, canSeeCost, stripKeys } = require("../utils/helpers");
const { createTransaction, getTransaction, presentTransaction } = require("../services/stock.service");
const { resolveCode } = require("../services/barcode.service");
const { audit } = require("../services/audit.service");

const companyWhere = (req, extra = {}) => {
  const where = { ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

module.exports = {
  // Book a stock-in / stock-out / transfer / stock count. See services/stock.service.js for the body.
  createTransaction: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const txn = await createTransaction({ companyId, user: req.user, body: req.body });
      await audit(req, companyId, "stock_transaction", txn.id, txn.txn_type, { txn_number: txn.txn_number, reason: txn.reason });
      res.status(201).json(new ApiResponse(201, presentTransaction(txn, req.user), `${txn.txn_number} posted`));
    } catch (error) {
      next(error);
    }
  },

  // Scan a barcode and move stock in one call (for handheld scanners / phone cameras).
  //   unit label    -> out: that one camera leaves stock   | in: that issued camera comes back from the customer
  //   product label -> out/in: `quantity` (default 1) of a counted product | in: new serial units are created (print their labels afterwards)
  scan: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const { code, action, location_id, quantity, reason, customer_id, supplier_id, reference_no, site_name, notes, txn_date, unit_cost } = req.body;
      const hit = await resolveCode(companyId, code);
      if (!hit) throw new ApiError(404, `No product or unit found for "${code}"`);

      const body = { txn_type: action, reason, location_id, customer_id, supplier_id, reference_no, site_name, notes, txn_date };
      if (hit.type === "unit") {
        body.reason = reason || (action === "in" ? "customer_return" : "sale");
        body.items = [{ product_id: hit.product.id, unit_barcodes: [hit.unit.barcode] }];
      } else if (hit.product.tracking_type === "serial" && action === "out") {
        throw new ApiError(400, `"${hit.product.name}" is tracked piece by piece - scan the barcode label on the unit itself`);
      } else {
        body.items = [{ product_id: hit.product.id, quantity: quantity || 1, unit_cost }];
      }
      const txn = await createTransaction({ companyId, user: req.user, body, source: "scan" });
      await audit(req, companyId, "stock_transaction", txn.id, `scan_${action}`, { txn_number: txn.txn_number, code });
      res.status(201).json(new ApiResponse(201, { matched: { type: hit.type, matched_by: hit.matched_by, product: hit.product.name, unit: hit.unit ? hit.unit.barcode : null }, transaction: presentTransaction(txn, req.user) }, `${txn.txn_number} posted`));
    } catch (error) {
      next(error);
    }
  },

  listTransactions: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = companyWhere(req);
      ["txn_type", "reason", "location_id", "supplier_id", "customer_id"].forEach((k) => { if (req.query[k]) where[k] = req.query[k]; });
      if (req.query.from || req.query.to) {
        where.txn_date = {};
        if (req.query.from) where.txn_date[Op.gte] = req.query.from;
        if (req.query.to) where.txn_date[Op.lte] = req.query.to;
      }
      if (req.query.q) where[Op.or] = [{ txn_number: { [Op.like]: `%${req.query.q}%` } }, { reference_no: { [Op.like]: `%${req.query.q}%` } }, { site_name: { [Op.like]: `%${req.query.q}%` } }];
      const { rows, count } = await StockTransaction.findAndCountAll({
        where, order: [["txn_date", "DESC"], ["id", "DESC"]], limit, offset, distinct: true,
        include: [
          { model: Location, as: "location", attributes: ["id", "name"] },
          { model: Location, as: "to_location", attributes: ["id", "name"] },
          { model: Supplier, as: "supplier", attributes: ["id", "name"] },
          { model: Customer, as: "customer", attributes: ["id", "name"] },
          { model: User, as: "creator", attributes: ["id", "name"] },
        ],
      });
      res.json(new ApiResponse(200, { transactions: rows, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  getTransaction: async (req, res, next) => {
    try {
      const companyId = getCompanyId(req) || (await StockTransaction.findByPk(req.params.id))?.company_id;
      const txn = companyId ? await getTransaction(companyId, req.params.id) : null;
      if (!txn) throw new ApiError(404, "Stock document not found");
      res.json(new ApiResponse(200, presentTransaction(txn, req.user)));
    } catch (error) {
      next(error);
    }
  },

  // Current stock per product per location
  getLevels: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = companyWhere(req);
      if (req.query.product_id) where.product_id = req.query.product_id;
      if (req.query.location_id) where.location_id = req.query.location_id;
      if (req.query.include_zero !== "true") where.quantity = { [Op.ne]: 0 };
      const productWhere = { is_deleted: false };
      if (req.query.category_id) productWhere.category_id = req.query.category_id;
      if (req.query.q) productWhere[Op.or] = [{ name: { [Op.like]: `%${req.query.q}%` } }, { barcode: { [Op.like]: `%${req.query.q}%` } }, { sku: { [Op.like]: `%${req.query.q}%` } }];
      const { rows, count } = await StockLevel.findAndCountAll({
        where, limit, offset, distinct: true,
        include: [
          { model: Product, as: "product", where: productWhere, attributes: ["id", "name", "sku", "barcode", "unit", "tracking_type", "reorder_level", "category_id"] },
          { model: Location, as: "location", attributes: ["id", "name", "code"] },
        ],
        order: [[{ model: Product, as: "product" }, "name", "ASC"], ["location_id", "ASC"]],
      });
      res.json(new ApiResponse(200, { levels: rows, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  // The ledger / stock card: every movement, newest first
  getMovements: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = companyWhere(req);
      ["product_id", "location_id", "unit_id", "direction", "reason", "transaction_id"].forEach((k) => { if (req.query[k]) where[k] = req.query[k]; });
      if (req.query.from || req.query.to) {
        where.movement_date = {};
        if (req.query.from) where.movement_date[Op.gte] = req.query.from;
        if (req.query.to) where.movement_date[Op.lte] = req.query.to;
      }
      const { rows, count } = await StockMovement.findAndCountAll({
        where, limit, offset, order: [["movement_date", "DESC"], ["id", "DESC"]],
        include: [
          { model: Product, as: "product", attributes: ["id", "name", "barcode", "unit"] },
          { model: Location, as: "location", attributes: ["id", "name"] },
          { model: StockUnit, as: "unit", attributes: ["id", "barcode", "serial_no"] },
          { model: StockTransaction, as: "transaction", attributes: ["id", "txn_number", "txn_type", "reference_no"] },
        ],
      });
      const movements = rows.map((m) => (canSeeCost(req.user) ? m.toJSON() : stripKeys(m, ["unit_cost"])));
      res.json(new ApiResponse(200, { movements, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },
};
