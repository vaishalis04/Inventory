const express = require("express");
const router = express.Router();
const Controller = require("../controllers/customer.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { partyRules } = require("../validations/master.validation");
const { MANAGE_ROLES } = require("../config/constants");

const manage = authorize(...MANAGE_ROLES);

router.use(protect);

router.get("/", Controller.list);
router.get("/:id", Controller.get);
router.post("/", manage, partyRules, Controller.create);
router.put("/:id", manage, partyRules, Controller.update);
router.delete("/:id", manage, Controller.remove);

module.exports = router;
