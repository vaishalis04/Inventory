const express = require("express");
const router = express.Router();
const Controller = require("../controllers/location.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { locationRules } = require("../validations/master.validation");
const { MANAGE_ROLES } = require("../config/constants");

const manage = authorize(...MANAGE_ROLES);

router.use(protect);

router.get("/", Controller.list);
router.get("/:id", Controller.get);
router.post("/", manage, locationRules, Controller.create);
router.put("/:id", manage, locationRules, Controller.update);
router.delete("/:id", manage, Controller.remove);

module.exports = router;
