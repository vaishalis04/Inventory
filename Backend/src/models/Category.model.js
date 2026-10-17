const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

// Free categories per company: "IP Camera", "NVR", "HDD", "Cable", "Sockets & Connectors", "SMPS"...
class Category extends Model {}

Category.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    parent_id: { type: DataTypes.BIGINT, allowNull: true }, // optional nesting: Camera > Dome Camera
    name: { type: DataTypes.STRING(100), allowNull: false },
    description: { type: DataTypes.STRING(255), allowNull: true },
    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Category",
    tableName: "categories",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["company_id"] }, { fields: ["company_id", "name"] }, { fields: ["parent_id"] }],
  }
);

module.exports = Category;
