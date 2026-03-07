const clientsByEvent = new Map();

function getSet(eventId) {
  const key = String(eventId || "").trim();
  if (!key) return null;
  if (!clientsByEvent.has(key)) {
    clientsByEvent.set(key, new Set());
  }
  return clientsByEvent.get(key);
}

function broadcast(eventId, type, payload) {
  const key = String(eventId || "").trim();
  const set = clientsByEvent.get(key);
  if (!set || !set.size) return 0;

  let sent = 0;
  const frame = `event: ${String(type || "message")}\ndata: ${JSON.stringify(payload || {})}\n\n`;
  for (const client of set) {
    try {
      client.res.write(frame);
      sent += 1;
    } catch (_) {}
  }
  return sent;
}

function viewerCount(eventId) {
  const key = String(eventId || "").trim();
  return clientsByEvent.get(key)?.size || 0;
}

function subscribe(eventId, res, viewer = {}) {
  const set = getSet(eventId);
  if (!set) return () => {};

  const client = { res, viewer };
  set.add(client);

  // Initial handshake event.
  res.write(`event: ready\ndata: ${JSON.stringify({ ok: true, eventId: String(eventId) })}\n\n`);
  broadcast(eventId, "viewer_count", { count: viewerCount(eventId) });

  const heartbeat = setInterval(() => {
    try {
      res.write(`event: heartbeat\ndata: ${JSON.stringify({ ts: Date.now() })}\n\n`);
    } catch (_) {}
  }, 25000);

  return () => {
    clearInterval(heartbeat);
    set.delete(client);
    if (set.size === 0) {
      clientsByEvent.delete(String(eventId));
      return;
    }
    broadcast(eventId, "viewer_count", { count: viewerCount(eventId) });
  };
}

function publish(eventId, type, payload) {
  return broadcast(eventId, type, payload);
}

module.exports = {
  subscribe,
  publish
};
