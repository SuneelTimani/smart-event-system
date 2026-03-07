const express = require("express");
const router = express.Router();
const { chatbot } = require("../controllers/chatbotController");
const { createRateLimiter } = require("../middleware/rateLimiter");

const chatbotRateLimit = createRateLimiter({
  windowMs: 60 * 1000,
  max: 20,
  message: "Too many chatbot requests. Please wait a minute."
});

router.post("/", chatbotRateLimit, chatbot);

module.exports = router;
