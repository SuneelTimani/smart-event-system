let redis = null;
try {
  redis = require("redis");
} catch {
  redis = null;
}

const memoryBuckets = new Map();

let redisClientPromise = null;
let warnedRedisUnavailable = false;

function getClientKey(req) {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.trim()) {
    return forwarded.split(",")[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || "unknown";
}

function getRateLimitPrefix() {
  return String(process.env.REDIS_RATE_LIMIT_PREFIX || "rate_limit").trim() || "rate_limit";
}

async function getRedisClient() {
  if (!redis || !process.env.REDIS_URL) return null;
  if (redisClientPromise) return redisClientPromise;

  redisClientPromise = (async () => {
    const client = redis.createClient({ url: process.env.REDIS_URL });
    client.on("error", (err) => {
      if (!warnedRedisUnavailable) {
        warnedRedisUnavailable = true;
        console.warn(`[RateLimiter] Redis unavailable, falling back to memory store: ${err.message}`);
      }
    });
    await client.connect();
    return client;
  })().catch((err) => {
    if (!warnedRedisUnavailable) {
      warnedRedisUnavailable = true;
      console.warn(`[RateLimiter] Redis connect failed, using memory store: ${err.message}`);
    }
    redisClientPromise = null;
    return null;
  });

  return redisClientPromise;
}

function hitMemoryBucket(key, windowMs, max) {
  const now = Date.now();
  const current = memoryBuckets.get(key);

  if (!current || current.expiresAt <= now) {
    const next = { count: 1, expiresAt: now + windowMs };
    memoryBuckets.set(key, next);
    return { allowed: true, retryAfterSec: 0 };
  }

  if (current.count >= max) {
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil((current.expiresAt - now) / 1000))
    };
  }

  current.count += 1;
  memoryBuckets.set(key, current);
  return { allowed: true, retryAfterSec: 0 };
}

async function hitRedisBucket(key, windowMs, max) {
  const client = await getRedisClient();
  if (!client) return null;

  const count = await client.incr(key);
  if (count === 1) {
    await client.pExpire(key, windowMs);
  }

  if (count > max) {
    const ttlMs = await client.pTTL(key);
    return {
      allowed: false,
      retryAfterSec: Math.max(1, Math.ceil(Math.max(ttlMs, 1000) / 1000))
    };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function createRateLimiter({ windowMs, max, message = "Too many requests, please try again later." }) {
  if (!windowMs || !max) {
    throw new Error("createRateLimiter requires windowMs and max");
  }

  return async (req, res, next) => {
    try {
      const scope = `${req.baseUrl || ""}:${req.path}:${getClientKey(req)}`;
      const key = `${getRateLimitPrefix()}:${scope}`;

      let result = await hitRedisBucket(key, windowMs, max);
      if (!result) {
        result = hitMemoryBucket(key, windowMs, max);
      }

      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSec));
        return res.status(429).json({
          error: message,
          code: "RATE_LIMITED"
        });
      }

      return next();
    } catch (err) {
      const fallbackKey = `${getRateLimitPrefix()}:${req.baseUrl || ""}:${req.path}:${getClientKey(req)}`;
      const result = hitMemoryBucket(fallbackKey, windowMs, max);
      if (!result.allowed) {
        res.setHeader("Retry-After", String(result.retryAfterSec));
        return res.status(429).json({
          error: message,
          code: "RATE_LIMITED"
        });
      }
      return next();
    }
  };
}

module.exports = { createRateLimiter };
