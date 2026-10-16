const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Header of a stock document: IN/2026-27/0001 (goods received), OUT/... (issue / sale), TRF/... (transfer), ADJ/... (stock count).
// Posted documents are never edited - a mistake is fixed with a new document (return, adjustment).
class StockTransaction extends Model {}

StockTransaction.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    txn_type: { type: DataTypes.ENUM("in", "out", "transfer", "adjustment"), allowNull: false },
    reason: { type: DataTypes.STRING(30), allowNull: false },
    txn_number: { type: DataTypes.STRING(40), allowNull: false },
    financial_year: { type: DataTypes.STRING(9), allowNull: false },
    sequence_no: { type: DataTypes.INTEGER, allowNull: false },
    txn_date: { type: DataTypes.DATEONLY, allowNull: false },
    location_id: { type: DataTypes.BIGINT, allowNull: false },     // where stock is received / issued / counted / transferred FROM
    to_location_id: { type: DataTypes.BIGINT, allowNull: true },   // transfers only
    supplier_id: { type: DataTypes.BIGINT, allowNull: true },
    customer_id: { type: DataTypes.BIGINT, allowNull: true },
    site_name: { type: DataTypes.STRING(255), allowNull: true },   // installation site for a site issue
    reference_no: { type: DataTypes.STRING(100), allowNull: true },// supplier invoice / challan / sales invoice number
    source: { type: DataTypes.ENUM("manual", "scan"), allowNull: false, defaultValue: "manual" },
    notes: { type: DataTypes.TEXT, allowNull: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
  },
  {
    sequelize,
    modelName: "StockTransaction",
    tableName: "stock_transactions",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "txn_number"], unique: true },
      { fields: ["company_id", "txn_type", "txn_date"] },
      { fields: ["company_id", "txn_date"] },
      { fields: ["location_id"] },
      { fields: ["supplier_id"] },
      { fields: ["customer_id"] },
    ],
  }
);

module.exports = StockTransaction;
