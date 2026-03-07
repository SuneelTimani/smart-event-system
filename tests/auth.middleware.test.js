const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { createMockReq, createMockRes } = require("./helpers/httpMock");

process.env.JWT_SECRET = process.env.JWT_SECRET || "test_jwt_secret_for_tests";
const { protect } = require("../middleware/authMiddleware");
const User = require("../models/User");

test("protect returns 401 when token is missing", async () => {
  const req = createMockReq({ headers: {} });
  const res = createMockRes();
  let nextCalled = false;

  await protect(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "NO_TOKEN");
});

test("protect returns 401 when token is invalid", async () => {
  const req = createMockReq({ headers: { Authorization: "bad-token" } });
  const res = createMockRes();
  let nextCalled = false;

  await protect(req, res, () => {
    nextCalled = true;
  });

  assert.equal(nextCalled, false);
  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, "INVALID_TOKEN");
});

test("protect sets req.user and calls next with valid token", async () => {
  const token = jwt.sign({ id: "u1", role: "admin", tv: 0, typ: "access" }, process.env.JWT_SECRET, { expiresIn: "1h" });
  const req = createMockReq({ headers: { Authorization: token } });
  const res = createMockRes();
  let nextCalled = false;
  const originalFindById = User.findById;
  try {
    User.findById = () => ({
      select: async () => ({
        _id: "u1",
        role: "admin",
        tokenVersion: 0,
        isAccountLocked: false
      })
    });

    await protect(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.user.id, "u1");
    assert.equal(req.user.role, "admin");
  } finally {
    User.findById = originalFindById;
  }
});
