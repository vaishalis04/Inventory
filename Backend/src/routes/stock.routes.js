const express = require("express");
const router = express.Router();
const Controller = require("../controllers/stock.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { transactionRules, scanRules } = require("../validations/stock.validation");
const { STOCK_ROLES } = require("../config/constants");

const stockWork = authorize(...STOCK_ROLES);

router.use(protect);

router.get("/levels", Controller.getLevels);
router.get("/movements", Controller.getMovements);

router.get("/transactions", Controller.listTransactions);
router.get("/transactions/:id", Controller.getTransaction);
router.post("/transactions", stockWork, transactionRules, Controller.createTransaction);

// scan a barcode, move stock
router.post("/scan", stockWork, scanRules, Controller.scan);

module.exports = router;
