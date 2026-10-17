const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");
const decimalField = require("./decimalField");

class Product extends Model {}

Product.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    company_id: { type: DataTypes.BIGINT, allowNull: false, references: { model: "companies", key: "id" } },
    category_id: { type: DataTypes.BIGINT, allowNull: true },
    sku: { type: DataTypes.STRING(60), allowNull: true },
    // what gets printed on the label. Auto-generated (P000123) unless you already have a manufacturer EAN/UPC to reuse.
    barcode: { type: DataTypes.STRING(64), allowNull: false },
    name: { type: DataTypes.STRING(255), allowNull: false },
    description: { type: DataTypes.TEXT, allowNull: true },
    brand: { type: DataTypes.STRING(100), allowNull: true },
    model_no: { type: DataTypes.STRING(100), allowNull: true },
    // free key/value specs: { "resolution": "4MP", "lens": "2.8mm", "ir_range": "30m" }
    specs: { type: DataTypes.JSON, allowNull: true },
    hsn_code: { type: DataTypes.STRING(10), allowNull: true },
    unit: { type: DataTypes.STRING(20), allowNull: false, defaultValue: "Nos" },
    // quantity: counted (connectors, cable, sockets). serial: every piece has its own barcode (camera, NVR, HDD)
    tracking_type: { type: DataTypes.ENUM("quantity", "serial"), allowNull: false, defaultValue: "quantity" },

    cost_price: decimalField("cost_price", 14, 4, { allowNull: true }),
    last_purchase_price: decimalField("last_purchase_price", 14, 4, { allowNull: true }),
    selling_price: decimalField("selling_price", 14, 4, { allowNull: true }),
    mrp: decimalField("mrp", 14, 4, { allowNull: true }),
    gst_rate: decimalField("gst_rate", 5, 2, { allowNull: false, defaultValue: 18 }),

    reorder_level: decimalField("reorder_level", 14, 3, { allowNull: false, defaultValue: 0 }), // low-stock alert when total <= this
    warranty_months: { type: DataTypes.INTEGER, allowNull: true },
    image: { type: DataTypes.STRING(255), allowNull: true },

    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Product",
    tableName: "products",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [
      { fields: ["company_id", "barcode"], unique: true },
      { fields: ["company_id", "sku"], unique: true },
      { fields: ["company_id"] },
      { fields: ["company_id", "category_id"] },
      { fields: ["company_id", "name"] },
      { fields: ["is_active"] },
    ],
  }
);

module.exports = Product;
