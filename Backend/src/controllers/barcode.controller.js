const { Op } = require("sequelize");
const { Company, Product, StockUnit } = require("../models");
const ApiError = require("../utils/ApiError");
const ApiResponse = require("../utils/ApiResponse");
const { getCompanyId, requireCompanyId } = require("../utils/helpers");
const { renderPng, renderSvg, describeCode, normaliseType } = require("../services/barcode.service");
const { buildLabelPdf } = require("../services/labelPdf.service");
const { LABEL_LAYOUTS, BARCODE_TYPES } = require("../config/constants");

const companyOf = async (companyId) => {
  const company = await Company.findOne({ where: { id: companyId, is_deleted: false } });
  if (!company) throw new ApiError(404, "Company not found");
  return company;
};

// ?format=png|svg  &type=code128|code39|ean13|qrcode|datamatrix  &scale=1-10  &text=false (hide the human-readable text)
const sendImage = async (req, res, text, defaultType) => {
  const type = normaliseType(req.query.type || defaultType);
  const opts = { type, scale: req.query.scale, height: req.query.height, includeText: req.query.text !== "false" };
  if (String(req.query.format || "png").toLowerCase() === "svg") {
    res.set("Content-Type", "image/svg+xml").send(renderSvg(text, opts));
  } else {
    res.set("Content-Type", "image/png").send(await renderPng(text, opts));
  }
};

module.exports = {
  getMeta: (req, res) => res.json(new ApiResponse(200, {
    types: BARCODE_TYPES,
    label_layouts: Object.entries(LABEL_LAYOUTS).map(([key, v]) => ({ key, description: v.description, labels_per_sheet: v.cols * v.rows })),
  })),

  productImage: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const company = await companyOf(companyId);
      const product = await Product.findOne({ where: { id: req.params.id, company_id: companyId, is_deleted: false } });
      if (!product) throw new ApiError(404, "Product not found");
      await sendImage(req, res, product.barcode, company.default_barcode_type);
    } catch (error) {
      next(error);
    }
  },

  unitImage: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const company = await companyOf(companyId);
      const unit = await StockUnit.findOne({ where: { id: req.params.id, company_id: companyId } });
      if (!unit) throw new ApiError(404, "Unit not found");
      await sendImage(req, res, unit.barcode, company.default_barcode_type);
    } catch (error) {
      next(error);
    }
  },

  // any text, e.g. to preview a barcode type before choosing it
  renderImage: async (req, res, next) => {
    try {
      if (!req.query.text) throw new ApiError(400, "text is required");
      await sendImage(req, res, req.query.text, req.query.type);
    } catch (error) {
      next(error);
    }
  },

  // scan -> what is this? Product or single unit, with stock figures.
  lookup: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const found = await describeCode(companyId, req.params.code);
      if (!found) throw new ApiError(404, `No product or unit found for "${req.params.code}"`);
      res.json(new ApiResponse(200, found));
    } catch (error) {
      next(error);
    }
  },

  /*
   * Printable label sheet (PDF). Body:
   *   products:      [{ product_id, copies }]       one label per copy, product barcode (counted items: cables, connectors, sockets)
   *   unit_ids:      [12, 13]                       labels for individual units
   *   unit_barcodes: ["U0000012"]                   same, by barcode
   *   transaction_id: 7                             labels for every unit created by that stock-in (print right after receiving goods)
   *   layout, type, show_price, show_company, border, start_position (skip labels already used on a part-printed sheet)
   */
  labels: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const company = await companyOf(companyId);
      const { products = [], unit_ids = [], unit_barcodes = [], transaction_id } = req.body;
      const type = normaliseType(req.body.type || company.default_barcode_type);
      const labels = [];

      if (products.length) {
        const ids = products.map((p) => p.product_id);
        const rows = await Product.findAll({ where: { id: { [Op.in]: ids }, company_id: companyId, is_deleted: false } });
        const byId = new Map(rows.map((p) => [String(p.id), p]));
        for (const entry of products) {
          const p = byId.get(String(entry.product_id));
          if (!p) throw new ApiError(404, `Product ${entry.product_id} not found`);
          for (let i = 0; i < (entry.copies || 1); i += 1) {
            labels.push({ code: p.barcode, title: p.name, subtitle: [p.brand, p.model_no].filter(Boolean).join(" "), price: p.mrp ?? p.selling_price });
          }
        }
      }

      if (unit_ids.length || unit_barcodes.length || transaction_id) {
        const or = [];
        if (unit_ids.length) or.push({ id: { [Op.in]: unit_ids } });
        if (unit_barcodes.length) or.push({ barcode: { [Op.in]: unit_barcodes } });
        if (transaction_id) or.push({ in_transaction_id: transaction_id });
        const units = await StockUnit.findAll({
          where: { company_id: companyId, [Op.or]: or }, order: [["id", "ASC"]],
          include: [{ model: Product, as: "product", attributes: ["name", "brand", "model_no", "mrp", "selling_price"] }],
        });
        if (!units.length) throw new ApiError(404, "No matching units found");
        units.forEach((u) => labels.push({
          code: u.barcode, title: u.product.name,
          subtitle: u.serial_no ? `S/N ${u.serial_no}` : [u.product.brand, u.product.model_no].filter(Boolean).join(" "),
          price: u.product.mrp ?? u.product.selling_price,
        }));
      }

      if (!labels.length) throw new ApiError(400, "Send products, unit_ids, unit_barcodes or transaction_id");
      const pdf = await buildLabelPdf(labels, {
        layout: req.body.layout, type, show_price: !!req.body.show_price, show_company: req.body.show_company !== false,
        company_name: company.name, border: !!req.body.border, start_position: req.body.start_position,
      });
      res.set({ "Content-Type": "application/pdf", "Content-Disposition": 'inline; filename="barcode-labels.pdf"' }).send(pdf);
    } catch (error) {
      next(error);
    }
  },
};
