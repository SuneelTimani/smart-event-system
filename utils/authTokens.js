const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = process.env.ACCESS_TOKEN_EXPIRES_IN || "15m";
const REFRESH_TOKEN_EXPIRES_IN = process.env.REFRESH_TOKEN_EXPIRES_IN || "30d";
const REFRESH_COOKIE_NAME = "refresh_token";
const ACCESS_COOKIE_NAME = "auth_token";

function authCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 1000 * 60 * 30
  };
}

function refreshCookieOptions() {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "strict" : "lax",
    maxAge: 1000 * 60 * 60 * 24 * 30
  };
}

function signAccessToken(user) {
  return jwt.sign(
    { id: user._id || user.id, role: user.role, tv: Number(user.tokenVersion || 0), typ: "access" },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN }
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    { id: user._id || user.id, tv: Number(user.tokenVersion || 0), typ: "refresh" },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN }
  );
}

function parseCookies(req) {
  const header = String(req.headers?.cookie || "");
  const out = {};
  if (!header) return out;
  header.split(";").forEach((part) => {
    const idx = part.indexOf("=");
    if (idx < 0) return;
    const k = part.slice(0, idx).trim();
    const v = part.slice(idx + 1).trim();
    out[k] = decodeURIComponent(v);
  });
  return out;
}

function setAuthCookies(res, user) {
  const accessToken = signAccessToken(user);
  const refreshToken = signRefreshToken(user);
  res.cookie(ACCESS_COOKIE_NAME, accessToken, authCookieOptions());
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, refreshCookieOptions());
  return { accessToken, refreshToken };
}

function clearAuthCookies(res) {
  res.clearCookie(ACCESS_COOKIE_NAME, authCookieOptions());
  res.clearCookie(REFRESH_COOKIE_NAME, refreshCookieOptions());
}

module.exports = {
  ACCESS_COOKIE_NAME,
  REFRESH_COOKIE_NAME,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
  authCookieOptions,
  refreshCookieOptions,
  signAccessToken,
  signRefreshToken,
  parseCookies,
  setAuthCookies,
  clearAuthCookies
};
