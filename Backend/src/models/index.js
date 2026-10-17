const sequelize = require("../config/db");

const Company = require("./Company.model");
const User = require("./User.model");
const Category = require("./Category.model");
const Location = require("./Location.model");
const Supplier = require("./Supplier.model");
const Customer = require("./Customer.model");
const Product = require("./Product.model");
const StockLevel = require("./StockLevel.model");
const StockUnit = require("./StockUnit.model");
const StockTransaction = require("./StockTransaction.model");
const StockTransactionItem = require("./StockTransactionItem.model");
const StockMovement = require("./StockMovement.model");
const NumberSeries = require("./NumberSeries.model");
const AuditLog = require("./AuditLog.model");

// Company -> everything it owns
const owned = [
  [User, "users"], [Category, "categories"], [Location, "locations"], [Supplier, "suppliers"], [Customer, "customers"],
  [Product, "products"], [StockLevel, "stock_levels"], [StockUnit, "units"], [StockTransaction, "transactions"],
  [StockMovement, "movements"], [NumberSeries, "number_series"],
];
owned.forEach(([Model, as]) => {
  Company.hasMany(Model, { foreignKey: "company_id", as });
  Model.belongsTo(Company, { foreignKey: "company_id", as: "company" });
});

// Catalogue
Category.hasMany(Product, { foreignKey: "category_id", as: "products" });
Product.belongsTo(Category, { foreignKey: "category_id", as: "category" });
Category.belongsTo(Category, { foreignKey: "parent_id", as: "parent" });

// Stock on hand
Product.hasMany(StockLevel, { foreignKey: "product_id", as: "levels" });
StockLevel.belongsTo(Product, { foreignKey: "product_id", as: "product" });
Location.hasMany(StockLevel, { foreignKey: "location_id", as: "levels" });
StockLevel.belongsTo(Location, { foreignKey: "location_id", as: "location" });

// Serialised units
Product.hasMany(StockUnit, { foreignKey: "product_id", as: "units" });
StockUnit.belongsTo(Product, { foreignKey: "product_id", as: "product" });
StockUnit.belongsTo(Location, { foreignKey: "location_id", as: "location" });
StockUnit.belongsTo(Supplier, { foreignKey: "supplier_id", as: "supplier" });
StockUnit.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });

// Stock documents
StockTransaction.hasMany(StockTransactionItem, { foreignKey: "transaction_id", as: "items" });
StockTransactionItem.belongsTo(StockTransaction, { foreignKey: "transaction_id", as: "transaction" });
StockTransactionItem.belongsTo(Product, { foreignKey: "product_id", as: "product" });
StockTransactionItem.hasMany(StockMovement, { foreignKey: "transaction_item_id", as: "movements" });
StockTransaction.belongsTo(Location, { foreignKey: "location_id", as: "location" });
StockTransaction.belongsTo(Location, { foreignKey: "to_location_id", as: "to_location" });
StockTransaction.belongsTo(Supplier, { foreignKey: "supplier_id", as: "supplier" });
StockTransaction.belongsTo(Customer, { foreignKey: "customer_id", as: "customer" });
StockTransaction.belongsTo(User, { foreignKey: "created_by", as: "creator" });

// Ledger
StockMovement.belongsTo(Product, { foreignKey: "product_id", as: "product" });
StockMovement.belongsTo(Location, { foreignKey: "location_id", as: "location" });
StockMovement.belongsTo(StockUnit, { foreignKey: "unit_id", as: "unit" });
StockMovement.belongsTo(StockTransaction, { foreignKey: "transaction_id", as: "transaction" });
StockMovement.belongsTo(User, { foreignKey: "performed_by", as: "performer" });

User.hasMany(AuditLog, { foreignKey: "performed_by", as: "audit_logs" });
AuditLog.belongsTo(User, { foreignKey: "performed_by", as: "performer" });

module.exports = {
  sequelize,
  Sequelize: require("sequelize"),
  Company,
  User,
  Category,
  Location,
  Supplier,
  Customer,
  Product,
  StockLevel,
  StockUnit,
  StockTransaction,
  StockTransactionItem,
  StockMovement,
  NumberSeries,
  AuditLog,
};
