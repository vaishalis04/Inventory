const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
require('dotenv').config();

const sequelize = require('./src/config/db');
const { errorHandler } = require('./src/middleware/error.middleware');
const { UPLOAD_DIR } = require('./src/middleware/upload.middleware');

const authRoutes = require('./src/routes/auth.routes');
const companyRoutes = require('./src/routes/company.routes');
const categoryRoutes = require('./src/routes/category.routes');
const locationRoutes = require('./src/routes/location.routes');
const supplierRoutes = require('./src/routes/supplier.routes');
const customerRoutes = require('./src/routes/customer.routes');
const productRoutes = require('./src/routes/product.routes');
const stockRoutes = require('./src/routes/stock.routes');
const unitRoutes = require('./src/routes/unit.routes');
const barcodeRoutes = require('./src/routes/barcode.routes');
const reportRoutes = require('./src/routes/report.routes');
const metaRoutes = require('./src/routes/meta.routes');

const app = express();

if (require.main === module) {
  (async () => {
    try {
      await sequelize.authenticate();
      if (process.env.SYNC_DB === 'true') {
        await sequelize.sync({ alter: true });
        console.log('✅ Database synchronized.');
      } else {
        console.log('ℹ️ Database sync skipped. Using existing tables.');
      }
    } catch (error) {
      console.error('❌ Database connection failed:', error.message);
    }
  })();
}

const allowedOrigins = ['http://localhost:5173', process.env.CLIENT_URL].filter(Boolean);

app.use(cors({
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error(`❌ Not allowed by CORS: ${origin}`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  exposedHeaders: ['Content-Disposition'],
}));

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV !== 'test') app.use(morgan('dev'));

// company logos and product photos are public images
app.use('/uploads/logos', express.static(path.join(UPLOAD_DIR, 'logos'), { fallthrough: false, maxAge: '1d' }));
app.use('/uploads/products', express.static(path.join(UPLOAD_DIR, 'products'), { fallthrough: false, maxAge: '1d' }));

app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/companies', companyRoutes);
app.use('/api/v1/categories', categoryRoutes);
app.use('/api/v1/locations', locationRoutes);
app.use('/api/v1/suppliers', supplierRoutes);
app.use('/api/v1/customers', customerRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/stock', stockRoutes);
app.use('/api/v1/units', unitRoutes);
app.use('/api/v1/barcodes', barcodeRoutes);
app.use('/api/v1/reports', reportRoutes);
app.use('/api/v1/meta', metaRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date(), database: 'MySQL' });
});

app.use(errorHandler);

const PORT = process.env.PORT || 5800;
if (require.main === module) {
  app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
}

module.exports = app;
