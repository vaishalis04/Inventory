// End-to-end: real Express app, real stock engine, real barcode + PDF rendering.
// Default: SQLite in memory replaces MySQL (no setup needed).  TEST_MYSQL=1 npm test  -> runs against a real MySQL/MariaDB
// (uses DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME from the environment and WIPES that database).
const useMysql = process.env.TEST_MYSQL === '1';
if (!useMysql) {
  process.env.DB_DIALECT = 'sqlite';
  process.env.DB_STORAGE = ':memory:';
}
process.env.JWT_SECRET = 'test-secret';
process.env.NODE_ENV = 'test';
const os = require('os');
const path = require('path');
const fs = require('fs');
process.env.UPLOAD_PATH = fs.mkdtempSync(path.join(os.tmpdir(), 'inv-uploads-'));

const test = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');

const app = require('../server');
const { sequelize, Company, User } = require('../src/models');

const api = request(app);
const S = {}; // shared state across the ordered steps below
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const bin = (res, cb) => { const c = []; res.on('data', (d) => c.push(d)); res.on('end', () => cb(null, Buffer.concat(c))); };

const post = (url, token, body) => api.post(url).set(auth(token)).send(body);
const get = (url, token) => api.get(url).set(auth(token));
const stockOf = async (productId, locationId) => {
  const r = await get(`/api/v1/products/${productId}`, S.admin);
  const row = r.body.data.stock.find((s) => String(s.location_id) === String(locationId));
  return row ? row.quantity : 0;
};

test.before(async () => {
  await sequelize.sync({ force: true });
  const company = await Company.create({ name: 'Bhopal CCTV Co', business_type: 'cctv' });
  const other = await Company.create({ name: 'Other Co', business_type: 'it' });
  S.companyId = company.id;
  await User.create({ name: 'Admin', email: 'admin@x.com', password: 'Admin@12345', role: 'company_admin', company_id: company.id });
  await User.create({ name: 'Keeper', email: 'keeper@x.com', password: 'Keeper@12345', role: 'storekeeper', company_id: company.id });
  await User.create({ name: 'Viewer', email: 'viewer@x.com', password: 'Viewer@12345', role: 'viewer', company_id: company.id });
  await User.create({ name: 'Other Admin', email: 'o@x.com', password: 'Admin@12345', role: 'company_admin', company_id: other.id });
  const login = async (email, password) => (await api.post('/api/v1/auth/login').send({ email, password })).body.data.token;
  S.admin = await login('admin@x.com', 'Admin@12345');
  S.keeper = await login('keeper@x.com', 'Keeper@12345');
  S.viewer = await login('viewer@x.com', 'Viewer@12345');
  S.other = await login('o@x.com', 'Admin@12345');
});

test('login rejects a wrong password', async () => {
  const r = await api.post('/api/v1/auth/login').send({ email: 'admin@x.com', password: 'nope' });
  assert.equal(r.status, 401);
});

test('masters: category, locations, supplier, customer', async () => {
  S.cat = (await post('/api/v1/categories', S.admin, { name: 'IP Camera' })).body.data.id;
  S.main = (await post('/api/v1/locations', S.admin, { name: 'Main Store', is_default: true })).body.data.id;
  S.van = (await post('/api/v1/locations', S.admin, { name: 'Service Van' })).body.data.id;
  S.supplier = (await post('/api/v1/suppliers', S.admin, { name: 'Distributor' })).body.data.id;
  S.customer = (await post('/api/v1/customers', S.admin, { name: 'Shop Owner' })).body.data.id;
  assert.ok(S.cat && S.main && S.van && S.supplier && S.customer);
  const dup = await post('/api/v1/categories', S.keeper, { name: 'Nope' });
  assert.equal(dup.status, 403, 'storekeeper cannot edit masters');
});

test('products get an automatic barcode; counted and serial products', async () => {
  const conn = await post('/api/v1/products', S.admin, { name: 'BNC Connector', tracking_type: 'quantity', unit: 'Nos', cost_price: 8, selling_price: 15, reorder_level: 100 });
  assert.equal(conn.status, 201);
  assert.equal(conn.body.data.barcode, 'P000001');
  S.bnc = conn.body.data.id;
  const cam = await post('/api/v1/products', S.admin, { name: 'IP Dome Camera 4MP', category_id: S.cat, tracking_type: 'serial', cost_price: 2300, mrp: 3200, warranty_months: 24, reorder_level: 2 });
  assert.equal(cam.body.data.barcode, 'P000002');
  S.cam = cam.body.data.id;
  const own = await post('/api/v1/products', S.admin, { name: 'Cable roll', barcode: '8901234567890', unit: 'Box' });
  assert.equal(own.body.data.barcode, '8901234567890', 'a manufacturer barcode can be reused');
  S.cable = own.body.data.id;
  const clash = await post('/api/v1/products', S.admin, { name: 'Another', barcode: 'P000001' });
  assert.equal(clash.status, 400);
  const badCat = await post('/api/v1/products', S.admin, { name: 'X', category_id: 9999 });
  assert.equal(badCat.status, 400);
});

test('bulk create reports each row on its own', async () => {
  const r = await post('/api/v1/products/bulk', S.admin, { products: [{ name: 'DC Jack' }, { name: 'SMPS 12V', unit: 'Nos' }, { name: 'Bad', barcode: 'P000001' }] });
  assert.equal(r.status, 201);
  assert.equal(r.body.data.created.length, 2);
  assert.equal(r.body.data.errors.length, 1);
});

test('counted stock in: levels, ledger and last purchase price', async () => {
  const r = await post('/api/v1/stock/transactions', S.keeper, {
    txn_type: 'in', location_id: S.main, supplier_id: S.supplier, reference_no: 'INV-1', items: [{ product_id: S.bnc, quantity: 100, unit_cost: 9 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.data.txn_number, /^IN\/\d{4}-\d{2}\/0001$/);
  assert.equal(r.body.data.items[0].unit_cost, undefined, 'storekeeper does not see purchase prices');
  assert.equal(await stockOf(S.bnc, S.main), 100);
  const p = await get(`/api/v1/products/${S.bnc}`, S.admin);
  assert.equal(p.body.data.last_purchase_price, 9);
});

test('counted stock out, and over-issue is refused without changing anything', async () => {
  const ok = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', reason: 'site_issue', location_id: S.main, customer_id: S.customer, site_name: 'Shop A', items: [{ product_id: S.bnc, quantity: 30 }] });
  assert.equal(ok.status, 201);
  assert.equal(await stockOf(S.bnc, S.main), 70);
  const bad = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', location_id: S.main, items: [{ product_id: S.bnc, quantity: 500 }] });
  assert.equal(bad.status, 400);
  assert.match(bad.body.message, /Not enough stock/);
  assert.equal(await stockOf(S.bnc, S.main), 70);
  const nums = await get('/api/v1/stock/transactions?txn_type=out', S.admin);
  assert.equal(nums.body.data.transactions.length, 1, 'the refused document was rolled back, no number burnt');
});

test('decimals: metres of cable, max 3 places', async () => {
  const r = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cable, quantity: 305.5 }] });
  assert.equal(r.status, 201);
  assert.equal(await stockOf(S.cable, S.main), 305.5);
  const bad = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cable, quantity: 1.2345 }] });
  assert.equal(bad.status, 400);
});

test('serial stock in creates one unit per piece with its own barcode', async () => {
  const r = await post('/api/v1/stock/transactions', S.admin, {
    txn_type: 'in', location_id: S.main, supplier_id: S.supplier, items: [{ product_id: S.cam, serials: ['SN-A1', 'SN-A2', 'SN-A3'], unit_cost: 2300 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const units = r.body.data.items[0].units;
  assert.equal(units.length, 3);
  assert.deepEqual(units.map((u) => u.barcode), ['U0000001', 'U0000002', 'U0000003']);
  S.txnIn = r.body.data.id;
  S.units = units;
  assert.equal(await stockOf(S.cam, S.main), 3);

  const dup = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cam, serials: ['SN-A1'] }] });
  assert.equal(dup.status, 400);
  assert.match(dup.body.message, /already registered/);

  const noSerial = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cam, quantity: 2 }] });
  assert.equal(noSerial.status, 201, 'serials are optional - the unit label is the identity');
  S.units.push(...noSerial.body.data.items[0].units);
  const frac = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cam, quantity: 1.5 }] });
  assert.equal(frac.status, 400);
});

test('serial stock out by unit barcode: status, customer, warranty', async () => {
  const noUnits = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', location_id: S.main, items: [{ product_id: S.cam, quantity: 1 }] });
  assert.equal(noUnits.status, 400, 'a camera cannot leave without saying which one');

  const r = await post('/api/v1/stock/transactions', S.keeper, {
    txn_type: 'out', reason: 'sale', location_id: S.main, customer_id: S.customer, site_name: 'Shop A', txn_date: '2026-10-01',
    unit_barcodes: ['U0000001'],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stockOf(S.cam, S.main), 4);

  const unit = await get(`/api/v1/units/${S.units[0].id}`, S.admin);
  assert.equal(unit.body.data.status, 'issued');
  assert.equal(unit.body.data.customer.name, 'Shop Owner');
  assert.equal(unit.body.data.warranty_expiry, '2028-10-01');
  assert.equal(unit.body.data.history.length, 2);
  assert.equal(unit.body.data.history[1].transaction.txn_type, 'out');

  const again = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', location_id: S.main, unit_barcodes: ['U0000001'] });
  assert.equal(again.status, 400);
  assert.match(again.body.message, /issued/);
});

test('customer return puts the unit back in stock', async () => {
  const r = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'in', reason: 'customer_return', location_id: S.main, unit_barcodes: ['U0000001'] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(await stockOf(S.cam, S.main), 5);
  const unit = await get(`/api/v1/units/${S.units[0].id}`, S.admin);
  assert.equal(unit.body.data.status, 'in_stock');
  assert.equal(unit.body.data.customer_id, null);
  const notIssued = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'in', reason: 'customer_return', location_id: S.main, unit_barcodes: ['U0000002'] });
  assert.equal(notIssued.status, 400);
});

test('transfer moves counted stock and single units', async () => {
  const r = await post('/api/v1/stock/transactions', S.keeper, {
    txn_type: 'transfer', location_id: S.main, to_location_id: S.van,
    items: [{ product_id: S.bnc, quantity: 20 }], unit_barcodes: ['U0000002', 'U0000003'],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.match(r.body.data.txn_number, /^TRF\//);
  assert.equal(await stockOf(S.bnc, S.main), 50);
  assert.equal(await stockOf(S.bnc, S.van), 20);
  assert.equal(await stockOf(S.cam, S.van), 2);
  assert.equal(await stockOf(S.cam, S.main), 3);

  const wrongPlace = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', location_id: S.main, unit_barcodes: ['U0000002'] });
  assert.equal(wrongPlace.status, 400);
  assert.match(wrongPlace.body.message, /another location/);
  const same = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'transfer', location_id: S.main, to_location_id: S.main, items: [{ product_id: S.bnc, quantity: 1 }] });
  assert.equal(same.status, 400);
});

test('stock count (adjustment) books only the difference', async () => {
  const r = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'adjustment', location_id: S.main, items: [{ product_id: S.bnc, counted_quantity: 47 }] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.data.items[0].system_quantity, 50);
  assert.equal(r.body.data.items[0].quantity, 3);
  assert.equal(await stockOf(S.bnc, S.main), 47);
  const serial = await post('/api/v1/stock/transactions', S.admin, { txn_type: 'adjustment', location_id: S.main, items: [{ product_id: S.cam, counted_quantity: 1 }] });
  assert.equal(serial.status, 400, 'serial units are not adjusted by count');
});

test('damaged unit leaves stock', async () => {
  const r = await post('/api/v1/stock/transactions', S.keeper, { txn_type: 'out', reason: 'damage', location_id: S.van, unit_barcodes: ['U0000003'] });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const unit = await get(`/api/v1/units/${S.units[2].id}`, S.admin);
  assert.equal(unit.body.data.status, 'damaged');
  assert.equal(unit.body.data.warranty_expiry, null);
  assert.equal(await stockOf(S.cam, S.van), 1);
});

test('barcode scan: counted product, unit label, serial number', async () => {
  const a = await post('/api/v1/stock/scan', S.keeper, { code: 'P000001', action: 'out', location_id: S.main, quantity: 5, customer_id: S.customer });
  assert.equal(a.status, 201, JSON.stringify(a.body));
  assert.equal(a.body.data.transaction.source, 'scan');
  assert.equal(await stockOf(S.bnc, S.main), 42);

  const b = await post('/api/v1/stock/scan', S.keeper, { code: 'U0000004', action: 'out', location_id: S.main, customer_id: S.customer });
  assert.equal(b.status, 201, JSON.stringify(b.body));
  assert.equal(b.body.data.matched.type, 'unit');

  const c = await post('/api/v1/stock/scan', S.keeper, { code: 'SN-A1', action: 'out', location_id: S.main });
  assert.equal(c.status, 201, JSON.stringify(c.body));
  assert.equal(c.body.data.matched.matched_by, 'serial_no');

  const d = await post('/api/v1/stock/scan', S.keeper, { code: 'P000002', action: 'out', location_id: S.main });
  assert.equal(d.status, 400, 'a serial product needs the unit label');
  const e = await post('/api/v1/stock/scan', S.keeper, { code: 'P000002', action: 'in', location_id: S.main, quantity: 2 });
  assert.equal(e.status, 201, 'scanning a serial product label for stock-in creates new units');
  assert.equal(e.body.data.transaction.items[0].units.length, 2);
  const f = await post('/api/v1/stock/scan', S.keeper, { code: 'NOPE', action: 'in', location_id: S.main });
  assert.equal(f.status, 404);
});

test('barcode images: png, svg, other symbologies, bad input', async () => {
  const png = await api.get(`/api/v1/barcodes/product/${S.bnc}`).set(auth(S.keeper)).buffer(true).parse(bin);
  assert.equal(png.status, 200);
  assert.equal(png.headers['content-type'], 'image/png');
  assert.equal(png.body.slice(1, 4).toString(), 'PNG');

  const svg = await api.get(`/api/v1/barcodes/unit/${S.units[0].id}?format=svg`).set(auth(S.keeper)).buffer(true).parse(bin);
  assert.equal(svg.status, 200);
  assert.match(svg.headers['content-type'], /^image\/svg\+xml/);
  assert.match(svg.body.toString(), /<svg/);

  const qr = await api.get(`/api/v1/barcodes/product/${S.bnc}?type=qrcode`).set(auth(S.keeper)).buffer(true).parse(bin);
  assert.equal(qr.status, 200);
  const ean = await api.get(`/api/v1/barcodes/product/${S.cable}?type=ean13`).set(auth(S.keeper)).buffer(true).parse(bin);
  assert.equal(ean.status, 200, 'a real EAN-13 manufacturer barcode renders as EAN-13');
  const badEan = await get(`/api/v1/barcodes/product/${S.bnc}?type=ean13`, S.keeper);
  assert.equal(badEan.status, 400, 'P000001 cannot be an EAN-13');
  const badType = await get('/api/v1/barcodes/render?text=abc&type=nope', S.keeper);
  assert.equal(badType.status, 400);
});

test('lookup resolves a scan into product or unit with stock', async () => {
  const u = await get('/api/v1/barcodes/lookup/U0000002', S.viewer);
  assert.equal(u.body.data.type, 'unit');
  assert.equal(u.body.data.unit.status, 'in_stock');
  const p = await get('/api/v1/barcodes/lookup/P000001', S.viewer);
  assert.equal(p.body.data.type, 'product');
  assert.equal(p.body.data.total_stock, 42 + 20);
  assert.equal((await get('/api/v1/barcodes/lookup/ZZZ', S.viewer)).status, 404);
});

test('label PDF: product copies, units of a stock-in, layouts', async () => {
  const pdf = (body, token = S.keeper) => api.post('/api/v1/barcodes/labels').set(auth(token)).send(body).buffer(true).parse(bin);
  const a = await pdf({ products: [{ product_id: S.bnc, copies: 24 }], layout: 'a4_3x7', show_price: true });
  assert.equal(a.status, 200, a.body.toString());
  assert.equal(a.body.slice(0, 5).toString(), '%PDF-');
  assert.equal((a.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2, '24 labels on a 21-label sheet = 2 pages');

  const b = await pdf({ transaction_id: S.txnIn, layout: 'thermal_50x25', type: 'qrcode' });
  assert.equal(b.status, 200, b.body.toString());
  assert.equal((b.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 3, 'one thermal page per unit of that stock-in');

  const c = await pdf({ products: [{ product_id: S.bnc, copies: 3 }], layout: 'a4_3x7', start_position: 20 });
  assert.equal((c.body.toString('latin1').match(/\/Type \/Page\b/g) || []).length, 2, 'starting at slot 20 spills onto a second sheet');

  assert.equal((await pdf({})).status, 400);
  assert.equal((await pdf({ products: [{ product_id: S.bnc, copies: 1 }], layout: 'x' })).status, 400);
  assert.equal((await pdf({ products: [{ product_id: S.bnc, copies: 1 }] }, S.viewer)).status, 403);
});

test('reports: low stock, summary, excel export; cost hidden from storekeeper', async () => {
  const low = await get('/api/v1/reports/low-stock', S.admin);
  assert.ok(low.body.data.rows.some((r) => r.name === 'BNC Connector'), 'BNC (62) is under its reorder level of 100');
  const sum = await get('/api/v1/reports/summary', S.admin);
  assert.equal(sum.status, 200);
  assert.ok(sum.body.data.stock_value > 0);
  assert.ok(sum.body.data.units_by_status.in_stock >= 1);
  assert.equal(sum.body.data.movements_today.in > 0, true);
  const keeperSum = await get('/api/v1/reports/summary', S.keeper);
  assert.equal(keeperSum.body.data.stock_value, undefined);
  const stock = await get('/api/v1/reports/stock', S.keeper);
  assert.equal(stock.body.data.rows[0].cost_price, undefined);

  const xlsx = await api.get('/api/v1/reports/stock/export').set(auth(S.admin)).buffer(true).parse(bin);
  assert.equal(xlsx.status, 200);
  assert.equal(xlsx.body.slice(0, 2).toString(), 'PK');
});

test('ledger and products respect roles', async () => {
  const led = await get(`/api/v1/stock/movements?product_id=${S.bnc}`, S.admin);
  assert.ok(led.body.data.movements.length >= 4);
  assert.equal(led.body.data.movements[0].balance_after >= 0, true);
  const keeperLedger = await get(`/api/v1/stock/movements?product_id=${S.bnc}`, S.keeper);
  assert.equal(keeperLedger.body.data.movements[0].unit_cost, undefined);
  const keeperProduct = await get(`/api/v1/products/${S.bnc}`, S.keeper);
  assert.equal(keeperProduct.body.data.cost_price, undefined);
  const viewerWrite = await post('/api/v1/stock/transactions', S.viewer, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.bnc, quantity: 1 }] });
  assert.equal(viewerWrite.status, 403);
});

test('cannot delete a product or location that still holds stock; tracking type is locked', async () => {
  assert.equal((await api.delete(`/api/v1/products/${S.bnc}`).set(auth(S.admin))).status, 400);
  assert.equal((await api.delete(`/api/v1/locations/${S.main}`).set(auth(S.admin))).status, 400);
  const lock = await api.put(`/api/v1/products/${S.bnc}`).set(auth(S.admin)).send({ name: 'BNC Connector', tracking_type: 'serial' });
  assert.equal(lock.status, 400);
});

test('one company never sees another company’s data', async () => {
  assert.equal((await get(`/api/v1/products/${S.bnc}`, S.other)).status, 404);
  assert.equal((await get('/api/v1/barcodes/lookup/P000001', S.other)).status, 404);
  assert.equal((await get('/api/v1/units?q=U0000001', S.other)).body.data.units.length, 0);
  const cross = await post('/api/v1/stock/transactions', S.other, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.bnc, quantity: 1 }] });
  assert.equal(cross.status, 404);
});

test('company barcode prefixes must differ', async () => {
  const r = await api.put('/api/v1/companies/me').set(auth(S.admin)).send({ barcode_prefix: 'X', unit_barcode_prefix: 'X' });
  assert.equal(r.status, 400);
});

// Parallel requests need real row locks (SELECT ... FOR UPDATE). SQLite in memory has one connection and no row locks,
// so this check only runs against MySQL:  TEST_MYSQL=1 npm test
test('concurrent stock-outs never oversell', { skip: !useMysql && 'needs MySQL (TEST_MYSQL=1)' }, async () => {
  await post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.van, items: [{ product_id: S.cable, quantity: 10 }] });
  const out = () => post('/api/v1/stock/transactions', S.admin, { txn_type: 'out', location_id: S.van, items: [{ product_id: S.cable, quantity: 6 }] });
  const results = await Promise.all([out(), out(), out(), out()]);
  assert.equal(results.filter((r) => r.status === 201).length, 1, JSON.stringify(results.map((r) => r.status)));
  assert.equal(await stockOf(S.cable, S.van), 4);
});

test('concurrent stock-ins of serial units never hand out the same barcode', { skip: !useMysql && 'needs MySQL (TEST_MYSQL=1)' }, async () => {
  const inn = () => post('/api/v1/stock/transactions', S.admin, { txn_type: 'in', location_id: S.main, items: [{ product_id: S.cam, quantity: 3 }] });
  const results = await Promise.all([inn(), inn(), inn()]);
  assert.deepEqual(results.map((r) => r.status), [201, 201, 201], JSON.stringify(results.map((r) => r.body.message)));
  const codes = results.flatMap((r) => r.body.data.items[0].units.map((u) => u.barcode));
  assert.equal(new Set(codes).size, 9);
  const numbers = results.map((r) => r.body.data.txn_number);
  assert.equal(new Set(numbers).size, 3);
});
