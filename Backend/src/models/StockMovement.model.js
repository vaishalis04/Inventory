const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");
const decimalField = require("./decimalField");

// The stock ledger. One row for every change of every quantity - never updated, never deleted.
// Serial-tracked products get one row per unit (quantity 1) so every unit has its own history.
class StockMovement extends Model {}

StockMovement.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false },
    product_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "products", key: "id" } },
    location_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "locations", key: "id" } },
    unit_id: { type: DataTypes.BIGINT, allowNull: true },
    transaction_id: { type: DataTypes.BIGINT, allowNull: false },
    transaction_item_id: { type: DataTypes.BIGINT, allowNull: true },
    movement_date: { type: DataTypes.DATEONLY, allowNull: false },
    direction: { type: DataTypes.ENUM("in", "out"), allowNull: false },
    reason: { type: DataTypes.STRING(30), allowNull: false },
    quantity: decimalField("quantity", 14, 3, { allowNull: false }),       // always positive
    balance_after: decimalField("balance_after", 14, 3, { allowNull: false }), // stock of this product at this location after the move
    unit_cost: decimalField("unit_cost", 14, 4, { allowNull: true }),
    performed_by: { type: DataTypes.BIGINT, allowNull: true },
  },
  {
    sequelize,
    modelName: "StockMovement",
    tableName: "stock_movements",
    timestamps: true,
    updatedAt: false,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "product_id", "movement_date"] },
      { fields: ["company_id", "location_id"] },
      { fields: ["unit_id"] },
      { fields: ["transaction_id"] },
      { fields: ["company_id", "movement_date"] },
    ],
  }
);

module.exports = StockMovement;
