const express = require("express");
const router = express.Router();
const {
  whatsAppStatusCallback,
  getPushPublicKey,
  subscribePush,
  unsubscribePush
} = require("../controllers/notificationController");
const { protect } = require("../middleware/authMiddleware");

router.get("/push/public-key", getPushPublicKey);
router.post("/push/subscribe", protect, subscribePush);
router.delete("/push/subscribe", protect, unsubscribePush);
router.post("/whatsapp-status", whatsAppStatusCallback);

module.exports = router;
