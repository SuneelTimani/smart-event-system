function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableExternalError(err) {
  if (!err) return false;
  const code = String(err.code || "").toUpperCase();
  const statusCode = Number(err.statusCode || err.status || 0);
  const type = String(err.type || "").toLowerCase();

  if (["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN", "ESOCKET", "ENOTFOUND"].includes(code)) return true;
  if (statusCode >= 500 || statusCode === 429) return true;
  if (type.includes("api_connection_error") || type.includes("rate_limit")) return true;
  return false;
}

async function withRetry(fn, options = {}) {
  const {
    retries = 2,
    baseDelayMs = 200,
    maxDelayMs = 2000,
    shouldRetry = isRetryableExternalError
  } = options;

  let attempt = 0;
  let lastError = null;
  while (attempt <= retries) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt >= retries || !shouldRetry(err)) break;
      const delayMs = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
      await wait(delayMs);
    }
    attempt += 1;
  }
  throw lastError;
}

function createCircuitBreaker(name, options = {}) {
  const failureThreshold = Number(options.failureThreshold || 5);
  const cooldownMs = Number(options.cooldownMs || 30000);
  const halfOpenMaxCalls = Number(options.halfOpenMaxCalls || 1);

  const state = {
    status: "closed",
    failureCount: 0,
    openedAt: 0,
    halfOpenCalls: 0
  };

  function canTryNow() {
    if (state.status === "closed") return true;
    if (state.status === "open") {
      if (Date.now() - state.openedAt >= cooldownMs) {
        state.status = "half_open";
        state.halfOpenCalls = 0;
      } else {
        return false;
      }
    }
    if (state.status === "half_open") {
      return state.halfOpenCalls < halfOpenMaxCalls;
    }
    return true;
  }

  async function execute(fn) {
    if (!canTryNow()) {
      const err = new Error(`Circuit open for ${name}`);
      err.code = "CIRCUIT_OPEN";
      throw err;
    }

    if (state.status === "half_open") state.halfOpenCalls += 1;

    try {
      const result = await fn();
      state.status = "closed";
      state.failureCount = 0;
      state.halfOpenCalls = 0;
      return result;
    } catch (err) {
      state.failureCount += 1;
      if (state.failureCount >= failureThreshold || state.status === "half_open") {
        state.status = "open";
        state.openedAt = Date.now();
      }
      throw err;
    }
  }

  return { execute };
}

module.exports = {
  withRetry,
  createCircuitBreaker,
  isRetryableExternalError
};
