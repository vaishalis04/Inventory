const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");
const decimalField = require("./decimalField");

// Current quantity of one product at one location. Always changed together with a StockMovement row,
// inside the same DB transaction, so the two can never disagree.
class StockLevel extends Model {}

StockLevel.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    product_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "products", key: "id" } },
    location_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "locations", key: "id" } },
    quantity: decimalField("quantity", 14, 3, { allowNull: false, defaultValue: 0 }),
  },
  {
    sequelize,
    modelName: "StockLevel",
    tableName: "stock_levels",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "product_id", "location_id"], unique: true },
      { fields: ["company_id"] },
      { fields: ["location_id"] },
    ],
  }
);

module.exports = StockLevel;
