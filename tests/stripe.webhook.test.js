const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const { createMockReq, createMockRes } = require("./helpers/httpMock");

function freshBookingController() {
  const p = path.resolve(__dirname, "../controllers/bookingController.js");
  delete require.cache[p];
  return require("../controllers/bookingController");
}

test("stripeWebhook returns 400 when STRIPE_SECRET_KEY is not configured", async () => {
  process.env.STRIPE_SECRET_KEY = "";
  process.env.STRIPE_WEBHOOK_SECRET = "whsec_test";
  const { stripeWebhook } = freshBookingController();

  const req = createMockReq({
    headers: { "stripe-signature": "sig" },
    body: Buffer.from("{}")
  });
  const res = createMockRes();

  await stripeWebhook(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.error || ""), /Stripe is not configured/i);
});

test("stripeWebhook returns 400 when STRIPE_WEBHOOK_SECRET is missing", async () => {
  process.env.STRIPE_SECRET_KEY = "sk_test_dummy";
  process.env.STRIPE_WEBHOOK_SECRET = "";
  const { stripeWebhook } = freshBookingController();

  const req = createMockReq({
    headers: { "stripe-signature": "sig" },
    body: Buffer.from("{}")
  });
  const res = createMockRes();

  await stripeWebhook(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(String(res.body?.error || ""), /STRIPE_WEBHOOK_SECRET is not configured/i);
});
