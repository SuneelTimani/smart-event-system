const test = require("node:test");
const assert = require("node:assert/strict");
const { createMockReq, createMockRes } = require("./helpers/httpMock");

const User = require("../models/User");
const { adminOnly } = require("../middleware/adminMiddleware");

test("adminOnly returns 403 for non-admin user", async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({ _id: "u1", role: "user" });

  const req = createMockReq({ user: { id: "u1", role: "user" } });
  const res = createMockRes();
  let nextCalled = false;

  await adminOnly(req, res, () => {
    nextCalled = true;
  });

  User.findById = originalFindById;

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, "ADMIN_ONLY");
});

test("adminOnly calls next for admin user", async () => {
  const originalFindById = User.findById;
  User.findById = async () => ({ _id: "a1", role: "admin" });

  const req = createMockReq({ user: { id: "a1", role: "admin" } });
  const res = createMockRes();
  let nextCalled = false;

  await adminOnly(req, res, () => {
    nextCalled = true;
  });

  User.findById = originalFindById;

  assert.equal(nextCalled, true);
  assert.equal(res.statusCode, 200);
});
