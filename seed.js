require('dotenv').config();
const {
  sequelize, Company, User, Category, Location, Supplier, Customer, Product,
} = require('./src/models');
const { createTransaction } = require('./src/services/stock.service');
const { nextProductBarcode } = require('./src/services/barcode.service');

const seed = async () => {
  await sequelize.authenticate();
  await sequelize.sync();
  console.log('Connected to DB');

  const [company] = await Company.findOrCreate({
    where: { name: 'Demo Security Systems' },
    defaults: { business_type: 'cctv', email: 'info@demo.com', city: 'Indore', state: 'Madhya Pradesh', address: '12 Market Road' },
  });

  const pass = process.env.SEED_ADMIN_PASSWORD || 'Admin@12345';
  await User.findOrCreate({ where: { email: 'super@admin.com' }, defaults: { name: 'Super Admin', password: pass, role: 'super_admin' } });
  const [admin] = await User.findOrCreate({
    where: { email: process.env.SEED_ADMIN_EMAIL || 'admin@company.com' },
    defaults: { name: 'Company Admin', password: pass, role: 'company_admin', company_id: company.id },
  });
  await User.findOrCreate({ where: { email: 'store@company.com' }, defaults: { name: 'Storekeeper', password: pass, role: 'storekeeper', company_id: company.id } });

  // ---- locations
  const [main] = await Location.findOrCreate({ where: { company_id: company.id, name: 'Main Store' }, defaults: { code: 'MAIN', is_default: true } });
  await Location.findOrCreate({ where: { company_id: company.id, name: 'Service Van 1' }, defaults: { code: 'VAN1' } });

  // ---- categories: any kind of inventory, these are just a starting point
  const cats = {};
  for (const name of ['IP Camera', 'Analog Camera', 'NVR / DVR', 'Hard Disk', 'Cable', 'Sockets & Connectors', 'Power Supply (SMPS)', 'Accessories']) {
    const [c] = await Category.findOrCreate({ where: { company_id: company.id, name }, defaults: {} });
    cats[name] = c.id;
  }

  // ---- parties
  const [supplier] = await Supplier.findOrCreate({ where: { company_id: company.id, name: 'Sample Distributor' }, defaults: { city: 'Mumbai', phone: '9999999999' } });
  await Customer.findOrCreate({ where: { company_id: company.id, name: 'Sample Customer Pvt Ltd' }, defaults: { city: 'Pune' } });

  // ---- products (serial = every piece gets its own label, quantity = counted)
  const defs = [
    { name: 'IP Dome Camera 4MP', category: 'IP Camera', tracking_type: 'serial', brand: 'Generic', model_no: 'D4MP', unit: 'Nos', cost_price: 2300, selling_price: 2850, mrp: 3200, warranty_months: 24, reorder_level: 5, hsn_code: '8525', specs: { resolution: '4MP', lens: '2.8mm', ir_range: '30m' } },
    { name: 'IP Bullet Camera 5MP', category: 'IP Camera', tracking_type: 'serial', brand: 'Generic', model_no: 'B5MP', unit: 'Nos', cost_price: 2900, selling_price: 3500, mrp: 3900, warranty_months: 24, reorder_level: 5, hsn_code: '8525' },
    { name: '8 Channel NVR', category: 'NVR / DVR', tracking_type: 'serial', brand: 'Generic', model_no: 'N8', unit: 'Nos', cost_price: 10500, selling_price: 12500, mrp: 14000, warranty_months: 24, reorder_level: 2, hsn_code: '8521' },
    { name: '2TB Surveillance HDD', category: 'Hard Disk', tracking_type: 'serial', brand: 'Generic', model_no: '2TB-SV', unit: 'Nos', cost_price: 4200, selling_price: 4900, mrp: 5400, warranty_months: 36, reorder_level: 3, hsn_code: '8471' },
    { name: 'CAT6 Cable 305m Box', category: 'Cable', tracking_type: 'quantity', unit: 'Box', cost_price: 5400, selling_price: 6200, mrp: 6800, reorder_level: 3, hsn_code: '8544' },
    { name: 'BNC Connector', category: 'Sockets & Connectors', tracking_type: 'quantity', unit: 'Nos', cost_price: 8, selling_price: 15, mrp: 20, reorder_level: 100, hsn_code: '8536' },
    { name: 'DC Jack Socket (Female)', category: 'Sockets & Connectors', tracking_type: 'quantity', unit: 'Nos', cost_price: 10, selling_price: 18, mrp: 25, reorder_level: 100, hsn_code: '8536' },
    { name: 'RJ45 Connector (pack of 100)', category: 'Sockets & Connectors', tracking_type: 'quantity', unit: 'Pkt', cost_price: 280, selling_price: 400, mrp: 450, reorder_level: 3, hsn_code: '8536' },
    { name: '12V 2A SMPS', category: 'Power Supply (SMPS)', tracking_type: 'quantity', unit: 'Nos', cost_price: 210, selling_price: 320, mrp: 399, reorder_level: 10, hsn_code: '8504' },
  ];
  const made = {};
  for (const d of defs) {
    const { category, ...rest } = d;
    let p = await Product.findOne({ where: { company_id: company.id, name: d.name } });
    if (!p) {
      p = await sequelize.transaction(async (t) =>
        Product.create({ ...rest, category_id: cats[category], company_id: company.id, barcode: await nextProductBarcode(company, t) }, { transaction: t }));
    }
    made[d.name] = p;
  }

  // ---- opening stock (only the first time)
  if (!(await require('./src/models').StockTransaction.count({ where: { company_id: company.id } }))) {
    await createTransaction({
      companyId: company.id, user: admin,
      body: {
        txn_type: 'in', reason: 'opening_stock', location_id: main.id, supplier_id: supplier.id, reference_no: 'OPENING',
        items: [
          { product_id: made['IP Dome Camera 4MP'].id, quantity: 10, unit_cost: 2300 },
          { product_id: made['IP Bullet Camera 5MP'].id, quantity: 6, unit_cost: 2900 },
          { product_id: made['8 Channel NVR'].id, quantity: 3, unit_cost: 10500 },
          { product_id: made['2TB Surveillance HDD'].id, quantity: 4, unit_cost: 4200 },
          { product_id: made['CAT6 Cable 305m Box'].id, quantity: 8, unit_cost: 5400 },
          { product_id: made['BNC Connector'].id, quantity: 500, unit_cost: 8 },
          { product_id: made['DC Jack Socket (Female)'].id, quantity: 400, unit_cost: 10 },
          { product_id: made['RJ45 Connector (pack of 100)'].id, quantity: 10, unit_cost: 280 },
          { product_id: made['12V 2A SMPS'].id, quantity: 25, unit_cost: 210 },
        ],
      },
    });
  }

  console.log(`✅ Seeded. Login: admin@company.com / ${pass}  (change this password!)`);
  await sequelize.close();
};

seed().catch((e) => { console.error(e); process.exit(1); });
