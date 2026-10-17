const { Op } = require("sequelize");
const makeCrud = require("../utils/crud");
const { Location, StockLevel } = require("../models");
const ApiError = require("../utils/ApiError");

module.exports = makeCrud({
  Model: Location,
  label: "Location",
  plural: "locations",
  fields: ["name", "code", "address", "is_default", "is_active"],
  // only one default location per company
  afterSave: async (row) => {
    if (row.is_default) {
      await Location.update({ is_default: false }, { where: { company_id: row.company_id, id: { [Op.ne]: row.id } } });
    }
  },
  beforeDelete: async (row) => {
    const stocked = await StockLevel.count({ where: { company_id: row.company_id, location_id: row.id, quantity: { [Op.gt]: 0 } } });
    if (stocked) throw new ApiError(400, "This location still holds stock - transfer it out first");
  },
});
