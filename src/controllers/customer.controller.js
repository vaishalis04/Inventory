const makeCrud = require("../utils/crud");
const { Customer } = require("../models");

module.exports = makeCrud({
  Model: Customer,
  label: "Customer",
  plural: "customers",
  fields: ["name", "contact_person", "email", "phone", "gstin", "address", "city", "state", "notes", "is_active"],
  searchFields: ["name", "contact_person", "phone", "gstin"],
});
