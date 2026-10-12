/** Bounded, all-request histograms. Sampled diagnostic rings cannot provide
 * unbiased latency percentiles, so fold these counters into the totals row. */
export const LATENCY_BUCKETS_MS = [0, 10, 25, 50, 100, 250, 500, 1_000, 2_000, 5_000,
  10_000, 20_000, 40_000, 60_000, 90_000, 120_000, 180_000, 300_000, 600_000, 1_800_000, 3_600_000] as const;
const ENDPOINTS = new Set(["chat.completions", "responses", "responses.compact", "messages",
  "images.generations", "images.edits", "images.variations"]);
interface Counter { requests: number; errors: number; max: number; buckets: number[] }
export interface SLAState { since: number; total: Counter; endpoints: Record<string, Counter> }
function emptyCounter(): Counter { return { requests: 0, errors: 0, max: 0, buckets: LATENCY_BUCKETS_MS.map(() => 0) }; }
export function parseSLAState(raw: string): SLAState {
  try {
    const state = JSON.parse(raw) as SLAState;
    const valid = (counter: Counter) => counter && Number.isSafeInteger(counter.requests) && counter.requests >= 0
      && Number.isSafeInteger(counter.errors) && counter.errors >= 0 && counter.errors <= counter.requests
      && Number.isFinite(counter.max) && counter.max >= 0 && counter.max <= LATENCY_BUCKETS_MS.at(-1)!
      && Array.isArray(counter.buckets) && counter.buckets.length === LATENCY_BUCKETS_MS.length
      && counter.buckets.every((count) => Number.isSafeInteger(count) && count >= 0)
      && counter.buckets.reduce((sum, count) => sum + count, 0) === counter.requests;
    if (Number.isSafeInteger(state.since) && state.since >= 0 && valid(state.total)
      && state.endpoints && Object.entries(state.endpoints).every(([key, counter]) =>
        (ENDPOINTS.has(key) || key === "other") && valid(counter))) return state;
  } catch { /* absent or invalid legacy state starts a new observation window */ }
  return { since: 0, total: emptyCounter(), endpoints: {} };
}
export function addSLAMetric(state: SLAState, duration: number, error: boolean, endpoint: string, now: number): void {
  const ms = Number.isFinite(duration) ? Math.max(0, Math.min(3_600_000, Math.trunc(duration))) : 0;
  const bucket = LATENCY_BUCKETS_MS.findIndex((upper) => ms <= upper);
  const key = ENDPOINTS.has(endpoint) ? endpoint : "other";
  state.since ||= now;
  const per = state.endpoints[key] ??= emptyCounter();
  for (const counter of [state.total, per]) {
    counter.requests += 1;
    counter.errors += error ? 1 : 0;
    counter.max = Math.max(counter.max, ms);
    counter.buckets[bucket] += 1;
  }
}
function latency(counter: Counter) {
  const percentile = (fraction: number) => {
    if (!counter.requests) return 0;
    const target = Math.max(1, Math.ceil(counter.requests * fraction));
    let seen = 0;
    for (let index = 0; index < counter.buckets.length; index += 1) {
      seen += counter.buckets[index];
      if (seen >= target) return Math.min(counter.max, LATENCY_BUCKETS_MS[index]);
    }
    return counter.max;
  };
  return { p50: percentile(0.5), p95: percentile(0.95), p99: percentile(0.99), max: counter.max };
}
function rates(counter: Counter) {
  return { requests: counter.requests, errors: counter.errors,
    success_rate: counter.requests ? (counter.requests - counter.errors) / counter.requests : 0,
    error_rate: counter.requests ? counter.errors / counter.requests : 0 };
}
export function slaSnapshot(state: SLAState, accounts: { total: number; online: number; cooldown: number; expired: number; isolated?: number }, now = Date.now()) {
  return {
    generated_at: new Date(now).toISOString(), uptime_seconds: null,
    window: "since_upgrade_or_stats_reset", observed_since: state.since ? new Date(state.since).toISOString() : null,
    latency_method: "histogram_upper_bound", latency_bucket_bounds_ms: LATENCY_BUCKETS_MS,
    ...rates(state.total), latency_ms: latency(state.total),
    per_endpoint: Object.entries(state.endpoints).map(([endpoint, counter]) => {
      const value = latency(counter);
      return { endpoint, ...rates(counter), p50_ms: value.p50, p95_ms: value.p95, p99_ms: value.p99 };
    }).sort((a, b) => b.requests - a.requests || a.endpoint.localeCompare(b.endpoint)), accounts,
  };
}
