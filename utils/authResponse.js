function authError(res, status, message, code) {
  return res.status(status).json({
    error: message,
    code
  });
}

module.exports = { authError };
