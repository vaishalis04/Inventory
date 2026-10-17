const express = require("express");
const router = express.Router();
const Controller = require("../controllers/barcode.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { labelRules } = require("../validations/stock.validation");
const { STOCK_ROLES } = require("../config/constants");

router.use(protect);

router.get("/meta", Controller.getMeta);
router.get("/render", Controller.renderImage);
router.get("/lookup/:code", Controller.lookup);
router.get("/product/:id", Controller.productImage);
router.get("/unit/:id", Controller.unitImage);
router.post("/labels", authorize(...STOCK_ROLES), labelRules, Controller.labels);

module.exports = router;
