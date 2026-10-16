# Inventory Management Backend

Node.js + Express + MySQL + Sequelize. Same layout as the quotation / attendance projects
(`server.js`, `src/{config,controllers,middleware,models,routes,services,utils,validations}`).

Inventory for **CCTV, security, IT and electrical** businesses (any business, really): cameras, NVR/DVR, HDD, cable, sockets,
connectors, SMPS... with **barcode generation** and **barcode-scan stock in / out**. Multi-company: every company only sees its own data.

## Setup
```bash
npm install
cp .env.example .env        # fill DB_* and JWT_SECRET
# create an empty MySQL database named in DB_NAME, then:
npm run seed                # tables + demo company, logins, categories, 9 products, opening stock
npm run dev
npm test                    # 24 tests on in-memory SQLite (no setup)
TEST_MYSQL=1 DB_USER=... DB_PASSWORD=... DB_NAME=a_scratch_db npm test   # same tests on real MySQL (WIPES that database)
```
Seed logins: `admin@company.com` (company admin), `store@company.com` (storekeeper), `super@admin.com` (super admin);
password `Admin@12345` - change them. Later model changes: `npm run sync-db` or `SYNC_DB=true`.

## The two kinds of products
| `tracking_type` | for | what is tracked |
|---|---|---|
| `quantity` | connectors, sockets, cable, SMPS, accessories | a number per location (decimals allowed, e.g. 305.5 m) |
| `serial` | cameras, NVR/DVR, HDD - anything with a warranty | **every piece** is a *unit* with its own barcode label, status, customer and warranty date |

Product label = `P000123` (one per product). Unit label = `U0000457` (one per physical camera). Prefixes are in company settings
(`barcode_prefix`, `unit_barcode_prefix`, they must differ). If a product already has a manufacturer EAN you can use it as the product `barcode`.
The tracking type is locked once stock has moved.

## Everything that changes stock is a *stock document*
`POST /stock/transactions` - one request = one database transaction (all lines or nothing), numbered per financial year
(`IN/2026-27/0001`, `OUT/...`, `TRF/...`, `ADJ/...`). Rows are locked while stock changes, so two people issuing the last item cannot both succeed.
Every change is also written to the immutable ledger (`stock_movements`) with the balance after it. **Posted documents are never edited or deleted** -
fix a mistake with a new document (return, adjustment).

| `txn_type` | reasons | notes |
|---|---|---|
| `in` | `purchase`, `opening_stock`, `customer_return`, `other_in` | serial products: send `quantity` or a `serials` list -> units + barcodes are created. `customer_return`: send `unit_barcodes` of issued units |
| `out` | `sale`, `site_issue`, `internal_use`, `supplier_return`, `damage`, `lost`, `other_out` | serial products: send `unit_barcodes`. sale/site_issue sets customer, site and **warranty expiry** (`txn_date` + `warranty_months`) |
| `transfer` | `transfer` | `location_id` -> `to_location_id`, counted quantities and units |
| `adjustment` | `stock_count` | send `counted_quantity`; only the difference is booked. Serial units are written off with `out` + `damage`/`lost` |

```jsonc
// receive 5 cameras with manufacturer serials, then print their labels
POST /stock/transactions
{ "txn_type":"in", "location_id":1, "supplier_id":1, "reference_no":"INV-884",
  "items":[ { "product_id":3, "serials":["SN1","SN2","SN3","SN4","SN5"], "unit_cost":2300 } ] }

// issue to a customer site by scanning unit labels (any mix of products)
POST /stock/transactions
{ "txn_type":"out", "reason":"site_issue", "location_id":1, "customer_id":4, "site_name":"Sharma Jewellers",
  "unit_barcodes":["U0000012","U0000013"], "items":[ { "product_id":7, "quantity":40 } ] }
```
Insufficient stock, units in the wrong place/status, duplicate serials and future dates are refused with a clear message and nothing is saved.
`allow_negative_stock` in company settings lets counted products go below zero (off by default).

## Scan flow (handheld scanner / phone camera)
- `GET /barcodes/lookup/:code` - what is this? Returns product or unit (status, customer, warranty) + stock per location. Accepts unit label, product label, manufacturer serial number or SKU.
- `POST /stock/scan` `{ "code":"U0000012", "action":"out", "location_id":1, "customer_id":4 }` - scan and book in one call.
  Unit label: out = that camera leaves, in = it comes back from the customer. Counted product label: `quantity` (default 1). Scanning a serial *product* label with `action:"in"` receives new units.

## Barcodes and labels
- `GET /barcodes/product/:id`, `/barcodes/unit/:id`, `/barcodes/render?text=` - `?format=png|svg &type=code128|code39|ean13|qrcode|datamatrix &scale=1-10 &text=false`
  (use `fetch` with the Bearer token and show the blob; an `<img src>` cannot send the header).
- `POST /barcodes/labels` -> **PDF label sheet**. Body: `products:[{product_id,copies}]`, `unit_ids`, `unit_barcodes`, or `transaction_id` (all units received in that stock-in),
  plus `layout`, `type`, `show_price`, `show_company`, `border`, `start_position` (skip labels already used on a part-printed sheet). Max 500 labels per request.
- Layouts (`GET /barcodes/meta`): `a4_3x7` (21/sheet), `a4_5x13` (65), `a4_2x5` (10), `thermal_50x25`, `thermal_75x50` (one label per page for roll printers).
  Sheet sizes are plain mm dimensions - check one printed sheet against your label stock before printing 500.

## API (all under `/api/v1`, `Authorization: Bearer <jwt>`)
- `auth`: POST `/login`, POST `/register`, GET `/users`, PATCH `/users/:id/active`, GET `/me`, PUT `/change-password`
- `companies`: GET/PUT `/me`, POST `/me/logo`; super admin: GET/POST `/`, PUT `/:id`
- `categories`, `locations`, `suppliers`, `customers`: CRUD (soft delete; a location with stock or a category with products cannot be deleted)
- `products`: GET `/` (`?q &category_id &tracking_type`, includes `total_stock`, `is_low`), GET `/:id` (stock per location, units by status), POST, POST `/bulk` (up to 200), PUT, DELETE, POST `/:id/image`
- `stock`: POST `/transactions`, GET `/transactions` (`?txn_type &reason &location_id &from &to &q`), GET `/transactions/:id`, POST `/scan`, GET `/levels`, GET `/movements` (the ledger / stock card: `?product_id &location_id &unit_id &from &to`)
- `units`: GET `/` (`?product_id &status &location_id &customer_id &q &warranty_expiring_days=60`), GET `/:id` (with full history), PUT `/:id` (serial number, notes, warranty date only)
- `barcodes`: see above
- `reports`: GET `/summary` (dashboard), `/stock` (per product, value, low flag; `?location_id &category_id &low_only=true`), `/low-stock`, `/stock/export` (Excel)
- `meta`: GET `/constants`

## Roles
`super_admin` (platform, pass `?companyId=`), `company_admin`, `manager` (masters + stock), `storekeeper` (stock documents, scans, labels; cannot edit masters
and **never sees purchase prices**), `viewer` (read only).

## Notes / limits
- Stock value = quantity x the product's current `cost_price` (not FIFO or weighted average). The cost on each purchase is kept on the ledger and in `last_purchase_price`.
- Reorder level is per product (all locations together). `GET /reports/low-stock` lists the products at or under it.
- The stock report loads the active catalogue and aggregates in Node - fine for thousands of products.
- Concurrency (row locks, unique barcodes and document numbers) is covered by tests that run only on MySQL (`TEST_MYSQL=1`); SQLite has no row locks.
