const MAX_SAMPLES = Math.max(200, Number(process.env.RUNTIME_METRICS_MAX_SAMPLES || 2000));
const samples = [];

function recordRequestSample({ ts, route, status, latencyMs }) {
  samples.push({
    ts: Number(ts || Date.now()),
    route: String(route || ""),
    status: Number(status || 0),
    latencyMs: Number(latencyMs || 0)
  });
  if (samples.length > MAX_SAMPLES) {
    samples.splice(0, samples.length - MAX_SAMPLES);
  }
}

function percentile(sorted, p) {
  if (!sorted.length) return 0;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function getRuntimeMonitoringStats({ windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const minTs = now - Math.max(60 * 1000, Number(windowMs || 0));
  const recent = samples.filter((s) => s.ts >= minTs);

  const count = recent.length;
  const latencies = recent.map((s) => s.latencyMs).filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  const avgLatencyMs = latencies.length
    ? Number((latencies.reduce((sum, n) => sum + n, 0) / latencies.length).toFixed(2))
    : 0;
  const p95LatencyMs = latencies.length ? percentile(latencies, 95) : 0;
  const errorCount = recent.filter((s) => s.status >= 500).length;
  const ratePerMin = Number((count / (Math.max(1, windowMs) / 60000)).toFixed(2));

  return {
    windowMs,
    requestCount: count,
    avgLatencyMs,
    p95LatencyMs,
    errorCount,
    requestsPerMin: ratePerMin
  };
}

module.exports = {
  recordRequestSample,
  getRuntimeMonitoringStats
};

