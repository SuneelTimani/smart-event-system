function notFoundHandler(req, res, next) {
  const err = new Error(`Route not found: ${req.method} ${req.originalUrl}`);
  err.statusCode = 404;
  next(err);
}

function errorHandler(err, req, res, next) {
  const statusCode = Number(err.statusCode || err.status || 500);
  const isProd = process.env.NODE_ENV === "production";
  const isServerError = statusCode >= 500;

  const payload = {
    error: isProd && isServerError ? "Internal Server Error" : (err.message || "Internal Server Error"),
    code: err.code || "UNHANDLED_ERROR"
  };

  if (!isProd && err.stack) {
    payload.stack = err.stack;
  }

  if (isServerError) {
    console.error("[ERROR]", err.stack || err.message || err);
  }

  res.status(statusCode).json(payload);
}

module.exports = {
  notFoundHandler,
  errorHandler
};
