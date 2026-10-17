const express = require("express");
const router = express.Router();
const Controller = require("../controllers/report.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/summary", Controller.summary);
router.get("/stock", Controller.stock);
router.get("/stock/export", Controller.exportStock);
router.get("/low-stock", Controller.lowStock);

module.exports = router;
