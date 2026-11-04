import type { GatewayStats, PublicAccount, RequestMetricRecord } from "./types";

export interface EndpointMetricTotals {
  endpoint: string;
  requests: number;
  errors: number;
}

function successRate(requests: number, errors: number): number {
  return requests > 0 ? Math.max(0, requests - errors) / requests : 0;
}

function percentile(sorted: number[], fraction: number): number {
  return sorted.length ? sorted[Math.floor((sorted.length - 1) * fraction)] : 0;
}

/** The detail ring intentionally retains all failures/slow requests but only
 * 1/64 of ordinary successes. Percentiles are therefore diagnostic samples,
 * not population SLA percentiles; the API labels that distinction explicitly. */
export function summarizeSampledLatency(records: Pick<RequestMetricRecord, "durationMs">[]): {
  p50: number; p95: number; p99: number; max: number; sampleSize: number; method: "biased_diagnostic_sample";
} {
  const sorted = records.map((record) => record.durationMs)
    .filter((value) => Number.isFinite(value) && value >= 0)
    .sort((a, b) => a - b);
  return {
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    p99: percentile(sorted, 0.99),
    max: sorted.at(-1) ?? 0,
    sampleSize: sorted.length,
    method: "biased_diagnostic_sample",
  };
}

export function buildSlaMetricsSnapshot(
  totals: GatewayStats,
  endpoints: EndpointMetricTotals[],
  latencyRecords: Pick<RequestMetricRecord, "durationMs">[],
  accounts: Pick<PublicAccount, "status">[],
  generatedAt = new Date().toISOString(),
) {
  const requests = totals.totalRequestCount;
  const errors = totals.totalErrorCount;
  return {
    generated_at: generatedAt,
    scope: "since_last_stats_reset" as const,
    requests,
    errors,
    success_rate: successRate(requests, errors),
    latency_ms: summarizeSampledLatency(latencyRecords),
    per_endpoint: endpoints.map((row) => ({
      endpoint: row.endpoint,
      requests: row.requests,
      errors: row.errors,
      success_rate: successRate(row.requests, row.errors),
    })).sort((a, b) => b.requests - a.requests || a.endpoint.localeCompare(b.endpoint)),
    accounts: {
      total: accounts.length,
      online: accounts.filter((account) => account.status === "online").length,
      cooldown: accounts.filter((account) => account.status === "cooldown").length,
      expired: accounts.filter((account) => account.status === "expired").length,
      isolated: accounts.filter((account) => account.status === "isolated").length,
    },
  };
}
