const ApiResponse = require("../utils/ApiResponse");
const { ROLES, BUSINESS_TYPES, TRACKING_TYPES, UNITS, TXN_TYPES, REASONS, DEFAULT_REASON, UNIT_STATUS, BARCODE_TYPES, LABEL_LAYOUTS } = require("../config/constants");

module.exports = {
  getConstants: (req, res) =>
    res.json(new ApiResponse(200, {
      roles: Object.values(ROLES),
      business_types: BUSINESS_TYPES,
      tracking_types: TRACKING_TYPES,
      units: UNITS,
      txn_types: TXN_TYPES,
      reasons: REASONS,
      default_reasons: DEFAULT_REASON,
      unit_statuses: UNIT_STATUS,
      barcode_types: BARCODE_TYPES,
      label_layouts: Object.keys(LABEL_LAYOUTS),
    })),
};
