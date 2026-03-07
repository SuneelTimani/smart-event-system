function createMockReq(overrides = {}) {
  return {
    headers: {},
    header(name) {
      return this.headers[name] || this.headers[name?.toLowerCase?.()] || undefined;
    },
    ...overrides
  };
}

function createMockRes() {
  return {
    statusCode: 200,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    send(payload) {
      this.body = payload;
      return this;
    }
  };
}

module.exports = {
  createMockReq,
  createMockRes
};
