const ExcelJS = require("exceljs");
const { Op } = require("sequelize");
const { Product, StockUnit, Location } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const { requireCompanyId, canSeeCost, todayStr } = require("../utils/helpers");
const { stockRows, movementCounts, totalsByProduct } = require("../services/report.service");
const moment = require("moment-timezone");

const hideCost = (req, rows) =>
  canSeeCost(req.user) ? rows : rows.map(({ cost_price, stock_value, ...rest }) => rest);

const filters = (req) => ({
  categoryId: req.query.category_id, locationId: req.query.location_id, q: req.query.q,
  lowOnly: req.query.low_only === "true", trackingType: req.query.tracking_type,
});

module.exports = {
  // dashboard numbers
  summary: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const rows = await stockRows(companyId);
      const today = todayStr();
      const weekAgo = moment(today).subtract(6, "days").format("YYYY-MM-DD");
      const [unitCounts, todayMoves, weekMoves, productCount, locationCount] = await Promise.all([
        StockUnit.findAll({ where: { company_id: companyId }, attributes: ["status", [StockUnit.sequelize.fn("COUNT", StockUnit.sequelize.col("id")), "n"]], group: ["status"], raw: true }),
        movementCounts(companyId, today),
        movementCounts(companyId, weekAgo),
        Product.count({ where: { company_id: companyId, is_deleted: false, is_active: true } }),
        Location.count({ where: { company_id: companyId, is_deleted: false, is_active: true } }),
      ]);
      const soon = await StockUnit.count({ where: { company_id: companyId, status: "issued", warranty_expiry: { [Op.between]: [today, moment(today).add(30, "days").format("YYYY-MM-DD")] } } });
      const data = {
        products: productCount,
        locations: locationCount,
        out_of_stock: rows.filter((r) => r.quantity <= 0).length,
        low_stock: rows.filter((r) => r.is_low).length,
        units_by_status: Object.fromEntries(unitCounts.map((u) => [u.status, Number(u.n)])),
        warranty_expiring_30_days: soon,
        movements_today: todayMoves,
        movements_last_7_days: weekMoves,
      };
      if (canSeeCost(req.user)) data.stock_value = Number(rows.reduce((a, r) => a + (r.stock_value || 0), 0).toFixed(2));
      res.json(new ApiResponse(200, data));
    } catch (error) {
      next(error);
    }
  },

  // stock per product (all locations, or one with ?location_id=), with value and low-stock flag
  stock: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const rows = hideCost(req, await stockRows(companyId, filters(req)));
      res.json(new ApiResponse(200, { count: rows.length, rows }));
    } catch (error) {
      next(error);
    }
  },

  lowStock: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const rows = hideCost(req, await stockRows(companyId, { ...filters(req), lowOnly: true }));
      res.json(new ApiResponse(200, { count: rows.length, rows }));
    } catch (error) {
      next(error);
    }
  },

  exportStock: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const rows = hideCost(req, await stockRows(companyId, filters(req)));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Stock");
      const cols = [
        { header: "Product", key: "name", width: 36 }, { header: "Barcode", key: "barcode", width: 16 }, { header: "SKU", key: "sku", width: 14 },
        { header: "Category", key: "category", width: 18 }, { header: "Brand", key: "brand", width: 14 }, { header: "Model", key: "model_no", width: 16 },
        { header: "Unit", key: "unit", width: 8 }, { header: "Tracking", key: "tracking_type", width: 10 },
        { header: "Stock", key: "quantity", width: 10 }, { header: "Reorder level", key: "reorder_level", width: 13 },
      ];
      if (canSeeCost(req.user)) cols.push({ header: "Cost price", key: "cost_price", width: 12 }, { header: "Stock value", key: "stock_value", width: 14 });
      ws.columns = cols;
      ws.getRow(1).font = { bold: true };
      ws.views = [{ state: "frozen", ySplit: 1 }];
      rows.forEach((r) => {
        const row = ws.addRow(r);
        if (r.is_low) row.getCell("quantity").font = { bold: true, color: { argb: "FFC00000" } };
      });
      res.set({
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="stock-${todayStr()}.xlsx"`,
      });
      res.send(Buffer.from(await wb.xlsx.writeBuffer()));
    } catch (error) {
      next(error);
    }
  },
};
