const makeCrud = require("../utils/crud");
const { Category, Product } = require("../models");
const ApiError = require("../utils/ApiError");

module.exports = makeCrud({
  Model: Category,
  label: "Category",
  plural: "categories",
  fields: ["name", "description", "parent_id", "is_active"],
  beforeDelete: async (row) => {
    const inUse = await Product.count({ where: { company_id: row.company_id, category_id: row.id, is_deleted: false } });
    if (inUse) throw new ApiError(400, `Category is used by ${inUse} product(s) - move them first`);
    const children = await Category.count({ where: { company_id: row.company_id, parent_id: row.id, is_deleted: false } });
    if (children) throw new ApiError(400, "Category has sub-categories - delete or move them first");
  },
});
