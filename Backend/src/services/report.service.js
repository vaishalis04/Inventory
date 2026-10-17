const { fn, col, Op } = require('sequelize');
const { Product, StockLevel, Category, StockMovement } = require('../models');

// total quantity per product (optionally for one location): Map(product_id -> number)
const totalsByProduct = async (companyId, locationId = null) => {
  const where = { company_id: companyId };
  if (locationId) where.location_id = locationId;
  const rows = await StockLevel.findAll({ where, attributes: ['product_id', [fn('SUM', col('quantity')), 'qty']], group: ['product_id'], raw: true });
  return new Map(rows.map((r) => [String(r.product_id), Number(r.qty)]));
};

// One row per active product with its stock, value and low-stock flag. Fine for catalogues of a few thousand items.
const stockRows = async (companyId, { categoryId, locationId, q, lowOnly, trackingType } = {}) => {
  const where = { company_id: companyId, is_deleted: false, is_active: true };
  if (categoryId) where.category_id = categoryId;
  if (trackingType) where.tracking_type = trackingType;
  if (q) {
    const like = `%${q}%`;
    where[Op.or] = [{ name: { [Op.like]: like } }, { sku: { [Op.like]: like } }, { barcode: { [Op.like]: like } }, { brand: { [Op.like]: like } }, { model_no: { [Op.like]: like } }];
  }
  const [products, totals] = await Promise.all([
    Product.findAll({ where, include: [{ model: Category, as: 'category', attributes: ['id', 'name'] }], order: [['name', 'ASC']] }),
    totalsByProduct(companyId, locationId),
  ]);
  let rows = products.map((p) => {
    const quantity = totals.get(String(p.id)) || 0;
    return {
      product_id: p.id, name: p.name, sku: p.sku, barcode: p.barcode, brand: p.brand, model_no: p.model_no,
      category: p.category ? p.category.name : null, unit: p.unit, tracking_type: p.tracking_type,
      quantity, reorder_level: p.reorder_level, is_low: p.reorder_level > 0 && quantity <= p.reorder_level,
      cost_price: p.cost_price, stock_value: p.cost_price != null ? Number((quantity * p.cost_price).toFixed(2)) : null,
    };
  });
  if (lowOnly) rows = rows.filter((r) => r.is_low);
  return rows;
};

const movementCounts = async (companyId, fromDate) => {
  const rows = await StockMovement.findAll({
    where: { company_id: companyId, movement_date: { [Op.gte]: fromDate } },
    attributes: ['direction', [fn('COUNT', col('id')), 'moves']], group: ['direction'], raw: true,
  });
  const get = (d) => Number((rows.find((r) => r.direction === d) || {}).moves || 0);
  return { in: get('in'), out: get('out') };
};

module.exports = { totalsByProduct, stockRows, movementCounts };
