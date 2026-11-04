import { describe, expect, it } from "vitest";
import { buildSlaMetricsSnapshot, summarizeSampledLatency } from "../src/sla-metrics";

describe("administrator SLA snapshot", () => {
  it("keeps exact counters separate from biased latency samples", () => {
    const result = buildSlaMetricsSnapshot(
      { totalRequestCount: 100, totalErrorCount: 2, totalTokenIn: 0, totalTokenOut: 0, lastRequestAt: null },
      [{ endpoint: "responses", requests: 60, errors: 2 }, { endpoint: "chat.completions", requests: 40, errors: 0 }],
      [{ durationMs: 10 }, { durationMs: 100 }, { durationMs: 1_000 }],
      [{ status: "online" }, { status: "cooldown" }, { status: "isolated" }],
      "2026-11-04T00:00:00.000Z",
    );
    expect(result).toMatchObject({
      requests: 100, errors: 2, success_rate: 0.98,
      latency_ms: { p50: 100, p95: 100, p99: 100, max: 1_000, sampleSize: 3, method: "biased_diagnostic_sample" },
      per_endpoint: [{ endpoint: "responses", requests: 60, errors: 2 }, { endpoint: "chat.completions", requests: 40, errors: 0 }],
      accounts: { total: 3, online: 1, cooldown: 1, isolated: 1, expired: 0 },
    });
  });

  it("returns zeros for empty samples and rejects invalid durations", () => {
    expect(summarizeSampledLatency([])).toMatchObject({ p50: 0, p95: 0, p99: 0, max: 0, sampleSize: 0 });
    expect(summarizeSampledLatency([{ durationMs: -1 }, { durationMs: Number.NaN }, { durationMs: 7 }]))
      .toMatchObject({ p50: 7, max: 7, sampleSize: 1 });
  });
});
