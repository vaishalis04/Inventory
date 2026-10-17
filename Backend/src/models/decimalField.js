const { DataTypes } = require("sequelize");

// DECIMAL column whose value is always read back as a JS number (null stays null)
const decimalField = (name, precision, scale, opts = {}) => ({
  type: DataTypes.DECIMAL(precision, scale),
  allowNull: opts.allowNull ?? false,
  ...(opts.defaultValue !== undefined && { defaultValue: opts.defaultValue }),
  get() {
    const v = this.getDataValue(name);
    return v === null || v === undefined ? null : Number(v);
  },
});

module.exports = decimalField;
