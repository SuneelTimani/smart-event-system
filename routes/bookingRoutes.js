const express = require("express");
const router = express.Router();
const {
  bookEvent,
  getBookings,
  getBookingById,
  registerTicket,
  createStripeCheckoutSession,
  confirmStripeSession,
  joinWaitlist,
  getMyWaitlist,
  cancelMyBooking,
  transferMyBooking,
  updateBookingStatus
} = require("../controllers/bookingController");
const { protect } = require("../middleware/authMiddleware");
const { adminOnly } = require("../middleware/adminMiddleware");

router.post("/book", protect, bookEvent);
router.post("/register-ticket", protect, registerTicket);
router.post("/stripe/checkout-session", protect, createStripeCheckoutSession);
router.post("/stripe/confirm-session", protect, confirmStripeSession);
router.post("/waitlist", protect, joinWaitlist);
router.get("/waitlist", protect, getMyWaitlist);
router.get("/", protect, getBookings);
router.get("/:id", protect, getBookingById);
router.patch("/:id/cancel", protect, cancelMyBooking);
router.patch("/:id/transfer", protect, transferMyBooking);
router.patch("/:id/status", protect, adminOnly, updateBookingStatus);

module.exports = router;
