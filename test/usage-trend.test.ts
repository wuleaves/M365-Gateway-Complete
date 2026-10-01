import { describe, expect, it } from "vitest";
import { aggregateUsageTrend, validTrendTimeZone, type UsageTrendRow } from "../src/usage-trend";

const row = (localTime: string, requests = 1): UsageTrendRow => ({
  minute: new Date(localTime).getTime(), requests, errors: 0, tokenIn: requests * 2, tokenOut: requests,
});

describe("usage trend", () => {
  it("aligns hourly buckets with half-hour time zones", () => {
    const result = aggregateUsageTrend([
      row("2026-03-04T09:47:00+05:30"),
      row("2026-03-04T10:03:00+05:30", 2),
      row("2026-03-04T11:03:00+05:30"),
    ], 1, "Asia/Kolkata");
    expect(result.granularity).toBe("hour");
    expect(result.points.map((point) => [point.key, point.requests])).toEqual([
      ["2026-03-04 09:00", 1], ["2026-03-04 10:00", 2], ["2026-03-04 11:00", 1],
    ]);
  });

  it("uses minute buckets for short histories and local dates for seven days", () => {
    const rows = [row("2026-03-04T23:59:00+08:00"), row("2026-03-05T00:01:00+08:00")];
    expect(aggregateUsageTrend(rows, 1, "Asia/Shanghai").points.map((point) => point.key)).toEqual([
      "2026-03-04 23:59", "2026-03-05 00:01",
    ]);
    expect(aggregateUsageTrend(rows, 7, "Asia/Shanghai").points.map((point) => point.key)).toEqual([
      "2026-03-04", "2026-03-05",
    ]);
  });

  it("rejects unsupported time zones", () => {
    expect(validTrendTimeZone("Asia/Shanghai")).toBe(true);
    expect(validTrendTimeZone("../../etc/passwd")).toBe(false);
    expect(validTrendTimeZone("Invalid/Zone")).toBe(false);
  });
});
