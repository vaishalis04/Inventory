const express = require("express");
const router = express.Router();
const Controller = require("../controllers/meta.controller");
const { protect } = require("../middleware/auth.middleware");

router.use(protect);

router.get("/constants", Controller.getConstants);

module.exports = router;
