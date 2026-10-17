const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");
const decimalField = require("./decimalField");

// One physical piece of a serial-tracked product (one camera, one NVR, one HDD) with its own barcode label.
class StockUnit extends Model {}

StockUnit.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    product_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "products", key: "id" } },
    barcode: { type: DataTypes.STRING(64), allowNull: false },      // our label, e.g. U0000457
    serial_no: { type: DataTypes.STRING(100), allowNull: true },    // the manufacturer's serial number, if you have it
    status: {
      type: DataTypes.ENUM("in_stock", "issued", "damaged", "lost", "returned_to_supplier"),
      allowNull: false,
      defaultValue: "in_stock",
    },
    location_id: { type: DataTypes.BIGINT, allowNull: true },       // current (or last known) location
    supplier_id: { type: DataTypes.BIGINT, allowNull: true },
    purchase_date: { type: DataTypes.DATEONLY, allowNull: true },
    purchase_cost: decimalField("purchase_cost", 14, 4, { allowNull: true }),
    customer_id: { type: DataTypes.BIGINT, allowNull: true },       // who it was issued / sold to
    site_name: { type: DataTypes.STRING(255), allowNull: true },    // installation site
    issued_at: { type: DataTypes.DATEONLY, allowNull: true },
    warranty_expiry: { type: DataTypes.DATEONLY, allowNull: true },
    in_transaction_id: { type: DataTypes.BIGINT, allowNull: true }, // the stock-in that created it (to reprint its labels)
    notes: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: "StockUnit",
    tableName: "stock_units",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "barcode"], unique: true },
      { fields: ["company_id", "product_id", "serial_no"], unique: true },
      { fields: ["company_id", "product_id", "status"] },
      { fields: ["company_id", "location_id", "status"] },
      { fields: ["customer_id"] },
      { fields: ["in_transaction_id"] },
    ],
  }
);

module.exports = StockUnit;
