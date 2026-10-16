const express = require("express");
const router = express.Router();
const Controller = require("../controllers/unit.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { STOCK_ROLES } = require("../config/constants");

router.use(protect);

router.get("/", Controller.listUnits);
router.get("/:id", Controller.getUnit);
router.put("/:id", authorize(...STOCK_ROLES), Controller.updateUnit);

module.exports = router;
