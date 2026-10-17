const { DataTypes, Model } = require("sequelize");
const sequelize = require("../config/db");

class Company extends Model {}

Company.init(
  {
    id: { type: DataTypes.BIGINT, primaryKey: true, autoIncrement: true },
    name: { type: DataTypes.STRING(255), allowNull: false },
    legal_name: { type: DataTypes.STRING(255), allowNull: true },
    business_type: {
      type: DataTypes.ENUM("cctv", "security", "it", "electrical", "other"),
      allowNull: false,
      defaultValue: "cctv",
    },
    email: { type: DataTypes.STRING(255), allowNull: true },
    phone: { type: DataTypes.STRING(20), allowNull: true },
    website: { type: DataTypes.STRING(255), allowNull: true },
    address: { type: DataTypes.TEXT, allowNull: true },
    city: { type: DataTypes.STRING(100), allowNull: true },
    state: { type: DataTypes.STRING(100), allowNull: true },
    pincode: { type: DataTypes.STRING(10), allowNull: true },
    gstin: { type: DataTypes.STRING(15), allowNull: true },
    logo: { type: DataTypes.STRING(255), allowNull: true },

    // ---- barcode settings
    // product barcodes look like P000123, unit (single camera / NVR) barcodes like U0000457.
    // The two prefixes must differ so a scan can never mean two things.
    barcode_prefix: { type: DataTypes.STRING(6), allowNull: false, defaultValue: "P" },
    unit_barcode_prefix: { type: DataTypes.STRING(6), allowNull: false, defaultValue: "U" },
    barcode_padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 6 },
    default_barcode_type: {
      type: DataTypes.ENUM("code128", "code39", "ean13", "qrcode", "datamatrix"),
      allowNull: false,
      defaultValue: "code128",
    },

    // ---- stock rules
    allow_negative_stock: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
    doc_number_padding: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 4 },

    is_active: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: true },
    created_by: { type: DataTypes.BIGINT, allowNull: true },
    updated_by: { type: DataTypes.BIGINT, allowNull: true },
    is_deleted: { type: DataTypes.BOOLEAN, allowNull: false, defaultValue: false },
  },
  {
    sequelize,
    modelName: "Company",
    tableName: "companies",
    timestamps: true,
    underscored: true,
    paranoid: false,
    indexes: [{ fields: ["is_active"] }, { fields: ["business_type"] }],
  }
);

module.exports = Company;
