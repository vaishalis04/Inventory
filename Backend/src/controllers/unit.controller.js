const { Op } = require("sequelize");
const moment = require("moment-timezone");
const { StockUnit, StockMovement, StockTransaction, Product, Location, Supplier, Customer } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, getPagination, paginationMeta, pick, canSeeCost, stripKeys, todayStr } = require("../utils/helpers");

const COST_FIELDS = ["purchase_cost"];
const unitInclude = [
  { model: Product, as: "product", attributes: ["id", "name", "barcode", "brand", "model_no", "warranty_months"] },
  { model: Location, as: "location", attributes: ["id", "name"] },
  { model: Customer, as: "customer", attributes: ["id", "name"] },
  { model: Supplier, as: "supplier", attributes: ["id", "name"] },
];

const scope = (req, extra = {}) => {
  const where = { ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};
const present = (req, u) => (canSeeCost(req.user) ? u.toJSON() : stripKeys(u, COST_FIELDS));

module.exports = {
  // Every individual camera / NVR / HDD with its status. ?warranty_expiring_days=60 lists units whose warranty ends soon.
  listUnits: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = scope(req);
      ["product_id", "status", "location_id", "customer_id", "supplier_id", "in_transaction_id"].forEach((k) => { if (req.query[k]) where[k] = req.query[k]; });
      if (req.query.q) where[Op.or] = [{ barcode: { [Op.like]: `%${req.query.q}%` } }, { serial_no: { [Op.like]: `%${req.query.q}%` } }];
      if (req.query.warranty_expiring_days) {
        const days = Math.min(Math.max(parseInt(req.query.warranty_expiring_days, 10) || 30, 1), 3650);
        where.warranty_expiry = { [Op.between]: [todayStr(), moment(todayStr()).add(days, "days").format("YYYY-MM-DD")] };
        where.status = where.status || "issued";
      }
      const { rows, count } = await StockUnit.findAndCountAll({ where, include: unitInclude, order: [["id", "DESC"]], limit, offset, distinct: true });
      res.json(new ApiResponse(200, { units: rows.map((u) => present(req, u)), pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  // One unit with its whole life: bought -> moved -> issued -> returned...
  getUnit: async (req, res, next) => {
    try {
      const unit = await StockUnit.findOne({ where: scope(req, { id: req.params.id }), include: unitInclude });
      if (!unit) throw new ApiError(404, "Unit not found");
      const history = await StockMovement.findAll({
        where: { company_id: unit.company_id, unit_id: unit.id }, order: [["id", "ASC"]],
        include: [
          { model: Location, as: "location", attributes: ["id", "name"] },
          { model: StockTransaction, as: "transaction", attributes: ["id", "txn_number", "txn_type", "reference_no", "site_name"] },
        ],
      });
      res.json(new ApiResponse(200, { ...present(req, unit), history: history.map((m) => (canSeeCost(req.user) ? m.toJSON() : stripKeys(m, ["unit_cost"]))) }));
    } catch (error) {
      next(error);
    }
  },

  // Only descriptive fields - status and location change through stock documents, never by hand
  updateUnit: async (req, res, next) => {
    try {
      const unit = await StockUnit.findOne({ where: scope(req, { id: req.params.id }) });
      if (!unit) throw new ApiError(404, "Unit not found");
      const patch = pick(req.body, ["serial_no", "notes", "warranty_expiry", "site_name"]);
      Object.keys(patch).forEach((k) => { if (patch[k] === "") patch[k] = null; });
      if (patch.serial_no && patch.serial_no !== unit.serial_no) {
        const dup = await StockUnit.findOne({ where: { company_id: unit.company_id, product_id: unit.product_id, serial_no: patch.serial_no } });
        if (dup) throw new ApiError(400, `Serial number ${patch.serial_no} is already registered`);
      }
      await unit.update(patch);
      res.json(new ApiResponse(200, present(req, unit), "Unit updated"));
    } catch (error) {
      next(error);
    }
  },
};
