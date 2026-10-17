const makeCrud = require("../utils/crud");
const { Supplier } = require("../models");

module.exports = makeCrud({
  Model: Supplier,
  label: "Supplier",
  plural: "suppliers",
  fields: ["name", "contact_person", "email", "phone", "gstin", "address", "city", "state", "notes", "is_active"],
  searchFields: ["name", "contact_person", "phone", "gstin"],
});
