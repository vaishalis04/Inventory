const express = require("express");
const router = express.Router();
const Controller = require("../controllers/product.controller");
const { protect } = require("../middleware/auth.middleware");
const { authorize } = require("../middleware/role.middleware");
const { uploadProductImage } = require("../middleware/upload.middleware");
const { productRules } = require("../validations/master.validation");
const { MANAGE_ROLES } = require("../config/constants");

const manage = authorize(...MANAGE_ROLES);

router.use(protect);

router.get("/", Controller.getProducts);
router.post("/bulk", manage, Controller.bulkCreate);
router.get("/:id", Controller.getProduct);
router.post("/", manage, productRules, Controller.createProduct);
router.put("/:id", manage, productRules, Controller.updateProduct);
router.post("/:id/image", manage, uploadProductImage.single("image"), Controller.uploadImage);
router.delete("/:id", manage, Controller.deleteProduct);

module.exports = router;
