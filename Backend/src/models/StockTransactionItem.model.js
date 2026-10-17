const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");
const decimalField = require("./decimalField");

class StockTransactionItem extends Model {}

StockTransactionItem.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    transaction_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "stock_transactions", key: "id" } },
    product_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "products", key: "id" } },
    quantity: decimalField("quantity", 14, 3, { allowNull: false, defaultValue: 0 }), // always positive; the document type gives the direction
    unit_cost: decimalField("unit_cost", 14, 4, { allowNull: true }),
    // stock count only
    system_quantity: decimalField("system_quantity", 14, 3, { allowNull: true }),
    counted_quantity: decimalField("counted_quantity", 14, 3, { allowNull: true }),
    notes: { type: DataTypes.STRING(500), allowNull: true },
  },
  {
    sequelize,
    modelName: "StockTransactionItem",
    tableName: "stock_transaction_items",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["transaction_id"] }, { fields: ["product_id"] }, { fields: ["company_id"] }],
  }
);

module.exports = StockTransactionItem;
