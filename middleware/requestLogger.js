const { randomUUID } = require("crypto");
const { recordRequestSample } = require("../utils/runtimeMetrics");

function requestLogger(req, res, next) {
  const start = Date.now();
  const requestId = randomUUID();
  req.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);

  res.on("finish", () => {
    const latencyMs = Date.now() - start;
    recordRequestSample({
      ts: Date.now(),
      route: req.originalUrl,
      status: res.statusCode,
      latencyMs
    });
    const log = {
      ts: new Date().toISOString(),
      level: "info",
      event: "http_request",
      requestId,
      method: req.method,
      route: req.originalUrl,
      status: res.statusCode,
      latencyMs,
      userId: req.user?.id || null,
      ip: req.ip || null
    };
    console.log(JSON.stringify(log));
  });

  next();
}

module.exports = { requestLogger };
