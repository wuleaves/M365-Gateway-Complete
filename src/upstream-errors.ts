const MAX_RETRY_AFTER_MS = 24 * 60 * 60_000;
/** Retain only a bounded duration across RPC/error wrapping, never HTTP bodies. */
export function retryAfterMilliseconds(cause: unknown): number {
  if (!cause || typeof cause !== "object") return 0;
  const value = (cause as { retryAfterMs?: unknown }).retryAfterMs;
  return typeof value === "number" && Number.isFinite(value)
    ? Math.max(0, Math.min(MAX_RETRY_AFTER_MS, Math.ceil(value))) : 0;
}
export function parseRetryAfter(value: string | null, now = Date.now()): number {
  if (!value?.trim()) return 0;
  const raw = value.trim();
  const duration = /^\d+(?:\.\d+)?$/u.test(raw) ? Number(raw) * 1_000 : Date.parse(raw) - now;
  return retryAfterMilliseconds({ retryAfterMs: duration });
}
