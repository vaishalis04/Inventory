const { Op } = require("sequelize");
const { sequelize, Company, Product, Category, StockLevel, StockUnit, StockMovement, Location } = require("../models");
const ApiResponse = require("../utils/ApiResponse");
const ApiError = require("../utils/ApiError");
const { getCompanyId, requireCompanyId, getPagination, paginationMeta, pick, canSeeCost, stripKeys } = require("../utils/helpers");
const { nextProductBarcode, assertBarcodeFree } = require("../services/barcode.service");
const { totalsByProduct } = require("../services/report.service");
const { audit } = require("../services/audit.service");

const FIELDS = ["category_id", "sku", "barcode", "name", "description", "brand", "model_no", "specs", "hsn_code", "unit",
  "tracking_type", "cost_price", "selling_price", "mrp", "gst_rate", "reorder_level", "warranty_months", "is_active"];
const COST_FIELDS = ["cost_price", "last_purchase_price"];

const scope = (req, extra = {}) => {
  const where = { is_deleted: false, ...extra };
  const companyId = getCompanyId(req);
  if (companyId) where.company_id = companyId;
  return where;
};

const present = (req, product, extra = {}) => {
  const j = canSeeCost(req.user) ? product.toJSON() : stripKeys(product, COST_FIELDS);
  return { ...j, ...extra };
};

const clean = (patch) => {
  ["sku", "barcode", "description", "brand", "model_no", "hsn_code"].forEach((k) => {
    if (patch[k] !== undefined && typeof patch[k] === "string") patch[k] = patch[k].trim() || null;
  });
  return patch;
};

const checkCategory = async (companyId, categoryId, transaction) => {
  if (!categoryId) return;
  const cat = await Category.findOne({ where: { id: categoryId, company_id: companyId, is_deleted: false }, transaction });
  if (!cat) throw new ApiError(400, "category_id does not exist");
};

// shared by single create and bulk create
const createOne = async (companyId, userId, input) => {
  return sequelize.transaction(async (t) => {
    const company = await Company.findOne({ where: { id: companyId, is_deleted: false }, transaction: t });
    if (!company) throw new ApiError(404, "Company not found");
    const patch = clean(pick(input, FIELDS));
    if (!patch.name) throw new ApiError(400, "Product name is required");
    await checkCategory(companyId, patch.category_id, t);
    if (patch.barcode) await assertBarcodeFree(companyId, patch.barcode, { transaction: t });
    else patch.barcode = await nextProductBarcode(company, t);
    return Product.create({ ...patch, company_id: companyId, created_by: userId }, { transaction: t });
  });
};

module.exports = {
  getProducts: async (req, res, next) => {
    try {
      const { page, limit, offset } = getPagination(req.query);
      const where = scope(req);
      if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
      if (req.query.category_id) where.category_id = req.query.category_id;
      if (req.query.tracking_type) where.tracking_type = req.query.tracking_type;
      if (req.query.q) {
        const like = `%${req.query.q}%`;
        where[Op.or] = [{ name: { [Op.like]: like } }, { sku: { [Op.like]: like } }, { barcode: { [Op.like]: like } },
          { brand: { [Op.like]: like } }, { model_no: { [Op.like]: like } }, { hsn_code: { [Op.like]: like } }];
      }
      const { rows, count } = await Product.findAndCountAll({
        where, order: [["name", "ASC"]], limit, offset,
        include: [{ model: Category, as: "category", attributes: ["id", "name"] }],
      });
      const companyId = getCompanyId(req);
      const totals = companyId ? await totalsByProduct(companyId) : new Map();
      const products = rows.map((p) => {
        const total = totals.get(String(p.id)) || 0;
        return present(req, p, { total_stock: total, is_low: p.reorder_level > 0 && total <= p.reorder_level });
      });
      res.json(new ApiResponse(200, { products, pagination: paginationMeta(count, page, limit) }));
    } catch (error) {
      next(error);
    }
  },

  getProduct: async (req, res, next) => {
    try {
      const product = await Product.findOne({ where: scope(req, { id: req.params.id }), include: [{ model: Category, as: "category", attributes: ["id", "name"] }] });
      if (!product) throw new ApiError(404, "Product not found");
      const levels = await StockLevel.findAll({
        where: { company_id: product.company_id, product_id: product.id },
        include: [{ model: Location, as: "location", attributes: ["id", "name", "code"] }],
      });
      const stock = levels.map((l) => ({ location_id: l.location_id, location: l.location?.name, quantity: l.quantity }));
      const extra = { stock, total_stock: stock.reduce((a, s) => a + s.quantity, 0) };
      if (product.tracking_type === "serial") {
        const rows = await StockUnit.findAll({
          where: { company_id: product.company_id, product_id: product.id },
          attributes: ["status", [sequelize.fn("COUNT", sequelize.col("id")), "n"]], group: ["status"], raw: true,
        });
        extra.units_by_status = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
      }
      res.json(new ApiResponse(200, present(req, product, extra)));
    } catch (error) {
      next(error);
    }
  },

  createProduct: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const product = await createOne(companyId, req.user.id, req.body);
      await audit(req, companyId, "product", product.id, "create", { name: product.name, barcode: product.barcode });
      res.status(201).json(new ApiResponse(201, present(req, product), "Product created"));
    } catch (error) {
      next(error);
    }
  },

  // many products at once (first import of the catalogue). Each row succeeds or fails on its own.
  bulkCreate: async (req, res, next) => {
    try {
      const companyId = requireCompanyId(req);
      const list = req.body.products;
      if (!Array.isArray(list) || !list.length) throw new ApiError(400, "products must be a non-empty array");
      if (list.length > 200) throw new ApiError(400, "At most 200 products per request");
      const created = [];
      const errors = [];
      for (let i = 0; i < list.length; i += 1) {
        try {
          const p = await createOne(companyId, req.user.id, list[i]);
          created.push({ row: i + 1, id: p.id, name: p.name, barcode: p.barcode });
        } catch (e) {
          errors.push({ row: i + 1, name: list[i]?.name || null, message: e.message });
        }
      }
      await audit(req, companyId, "product", null, "bulk_create", { created: created.length, failed: errors.length });
      res.status(errors.length && !created.length ? 400 : 201).json(new ApiResponse(errors.length && !created.length ? 400 : 201, { created, errors }, `${created.length} created, ${errors.length} failed`));
    } catch (error) {
      next(error);
    }
  },

  updateProduct: async (req, res, next) => {
    try {
      const product = await Product.findOne({ where: scope(req, { id: req.params.id }) });
      if (!product) throw new ApiError(404, "Product not found");
      const patch = clean(pick(req.body, FIELDS));
      if (patch.name === null) throw new ApiError(400, "Product name cannot be empty");
      if (patch.category_id !== undefined) await checkCategory(product.company_id, patch.category_id);

      // piece-by-piece vs counted cannot change once stock history exists
      if (patch.tracking_type && patch.tracking_type !== product.tracking_type) {
        const moved = await StockMovement.count({ where: { company_id: product.company_id, product_id: product.id } });
        if (moved) throw new ApiError(400, "tracking_type cannot be changed after stock has moved for this product");
      }
      // changing the barcode makes already printed labels useless - allowed, but it must still be unique
      if (patch.barcode && patch.barcode !== product.barcode) await assertBarcodeFree(product.company_id, patch.barcode, { exceptProductId: product.id });
      if (patch.barcode === null) delete patch.barcode;

      await product.update({ ...patch, updated_by: req.user.id });
      await audit(req, product.company_id, "product", product.id, "update", Object.keys(patch));
      res.json(new ApiResponse(200, present(req, product), "Product updated"));
    } catch (error) {
      next(error);
    }
  },

  deleteProduct: async (req, res, next) => {
    try {
      const product = await Product.findOne({ where: scope(req, { id: req.params.id }) });
      if (!product) throw new ApiError(404, "Product not found");
      const stocked = await StockLevel.count({ where: { company_id: product.company_id, product_id: product.id, quantity: { [Op.gt]: 0 } } });
      if (stocked) throw new ApiError(400, "This product still has stock - issue or adjust it to zero first");
      await product.update({ is_active: false, is_deleted: true, updated_by: req.user.id });
      await audit(req, product.company_id, "product", product.id, "delete", { name: product.name });
      res.json(new ApiResponse(200, null, "Product deleted"));
    } catch (error) {
      next(error);
    }
  },

  uploadImage: async (req, res, next) => {
    try {
      if (!req.file) throw new ApiError(400, "Image is required (field name: image)");
      const product = await Product.findOne({ where: scope(req, { id: req.params.id }) });
      if (!product) throw new ApiError(404, "Product not found");
      await product.update({ image: `products/${req.file.filename}`, updated_by: req.user.id });
      res.json(new ApiResponse(200, { image: product.image }, "Image uploaded"));
    } catch (error) {
      next(error);
    }
  },
};
