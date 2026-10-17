const { Op } = require("sequelize");
const ApiResponse = require("./ApiResponse");
const ApiError = require("./ApiError");
const { getCompanyId, requireCompanyId, getPagination, paginationMeta, pick } = require("./helpers");

// Thin CRUD for the simple company-owned masters (categories, locations, suppliers, customers).
// Everything is scoped to the caller's company; delete is a soft delete.
const makeCrud = ({ Model, label, plural, fields, searchFields = ["name"], order = [["name", "ASC"]], include = [], beforeDelete, afterSave }) => {
  const scope = (req, extra = {}) => {
    const where = { is_deleted: false, ...extra };
    const companyId = getCompanyId(req);
    if (companyId) where.company_id = companyId;
    return where;
  };
  const clean = (patch) => {
    Object.keys(patch).forEach((k) => { if (patch[k] === "") patch[k] = null; });
    return patch;
  };

  return {
    list: async (req, res, next) => {
      try {
        const { page, limit, offset } = getPagination(req.query);
        const where = scope(req);
        if (req.query.active !== "all") where.is_active = req.query.active === "false" ? false : true;
        if (req.query.q) where[Op.or] = searchFields.map((f) => ({ [f]: { [Op.like]: `%${req.query.q}%` } }));
        const { rows, count } = await Model.findAndCountAll({ where, include, order, limit, offset });
        res.json(new ApiResponse(200, { [plural]: rows, pagination: paginationMeta(count, page, limit) }));
      } catch (error) {
        next(error);
      }
    },

    get: async (req, res, next) => {
      try {
        const row = await Model.findOne({ where: scope(req, { id: req.params.id }), include });
        if (!row) throw new ApiError(404, `${label} not found`);
        res.json(new ApiResponse(200, row));
      } catch (error) {
        next(error);
      }
    },

    create: async (req, res, next) => {
      try {
        const companyId = requireCompanyId(req);
        const row = await Model.create({ ...clean(pick(req.body, fields)), company_id: companyId, created_by: req.user.id });
        if (afterSave) await afterSave(row, req);
        res.status(201).json(new ApiResponse(201, row, `${label} created`));
      } catch (error) {
        next(error);
      }
    },

    update: async (req, res, next) => {
      try {
        const row = await Model.findOne({ where: scope(req, { id: req.params.id }) });
        if (!row) throw new ApiError(404, `${label} not found`);
        await row.update({ ...clean(pick(req.body, fields)), updated_by: req.user.id });
        if (afterSave) await afterSave(row, req);
        res.json(new ApiResponse(200, row, `${label} updated`));
      } catch (error) {
        next(error);
      }
    },

    remove: async (req, res, next) => {
      try {
        const row = await Model.findOne({ where: scope(req, { id: req.params.id }) });
        if (!row) throw new ApiError(404, `${label} not found`);
        if (beforeDelete) await beforeDelete(row, req);
        await row.update({ is_active: false, is_deleted: true, updated_by: req.user.id });
        res.json(new ApiResponse(200, null, `${label} deleted`));
      } catch (error) {
        next(error);
      }
    },
  };
};

module.exports = makeCrud;
