const express = require("express");
const router = express.Router();
const {
  register,
  verifySignupOtp,
  resendSignupOtp,
  login,
  getMe,
  getPublicUser,
  followUser,
  unfollowUser,
  getMyFollowing,
  updateMe,
  refreshAccessToken,
  logout,
  requestPasswordReset,
  verifyResetOtp,
  resetPassword
} = require("../controllers/authController");
const { protect } = require("../middleware/authMiddleware");
const { createRateLimiter } = require("../middleware/rateLimiter");

const authRateLimit = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: "Too many authentication attempts. Please wait 15 minutes and try again."
});

router.post("/register", authRateLimit, register);
router.post("/verify-signup-otp", authRateLimit, verifySignupOtp);
router.post("/resend-signup-otp", authRateLimit, resendSignupOtp);
router.post("/login", authRateLimit, login);
router.post("/refresh", refreshAccessToken);
router.post("/logout", logout);
router.post("/forgot-password", authRateLimit, requestPasswordReset);
router.post("/verify-reset-otp", authRateLimit, verifyResetOtp);
router.post("/reset-password", authRateLimit, resetPassword);
router.get("/me", protect, getMe);
router.get("/me/following", protect, getMyFollowing);
router.put("/me", protect, updateMe);
router.get("/users/:id/public", getPublicUser);
router.post("/follow/:id", protect, followUser);
router.delete("/follow/:id", protect, unfollowUser);

module.exports = router;
