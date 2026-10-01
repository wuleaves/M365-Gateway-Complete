export interface UsageTrendRow {
  minute: number;
  requests: number;
  errors: number;
  tokenIn: number;
  tokenOut: number;
}

export interface UsageTrendPoint {
  key: string;
  requests: number;
  errors: number;
  tokenIn: number;
  tokenOut: number;
}

export function validTrendTimeZone(value: string): boolean {
  if (!value || value.length > 64 || !/^[A-Za-z0-9_+\/-]+$/u.test(value)) return false;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value });
    return true;
  } catch {
    return false;
  }
}

/** UTC minute records preserve local hour boundaries, including half-hour zones and DST. */
export function aggregateUsageTrend(rows: UsageTrendRow[], days: 1 | 7, timeZone: string): { granularity: "minute" | "hour" | "day"; points: UsageTrendPoint[] } {
  if (!validTrendTimeZone(timeZone)) throw new Error("INVALID_TREND_TIMEZONE");
  const span = rows.length > 1 ? rows[rows.length - 1].minute - rows[0].minute : 0;
  const granularity = days === 7 ? "day" : span < 60 * 60_000 ? "minute" : "hour";
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric", month: "2-digit", day: "2-digit",
    ...(granularity === "day" ? {} : { hour: "2-digit", hourCycle: "h23" as const }),
    ...(granularity === "minute" ? { minute: "2-digit" } : {}),
  });
  const points = new Map<string, UsageTrendPoint>();
  for (const row of rows) {
    const parts = Object.fromEntries(formatter.formatToParts(row.minute).filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
    const key = `${parts.year}-${parts.month}-${parts.day}${granularity === "day" ? "" : ` ${parts.hour}:${granularity === "hour" ? "00" : parts.minute}`}`;
    const point = points.get(key) ?? { key, requests: 0, errors: 0, tokenIn: 0, tokenOut: 0 };
    point.requests += row.requests;
    point.errors += row.errors;
    point.tokenIn += row.tokenIn;
    point.tokenOut += row.tokenOut;
    points.set(key, point);
  }
  return { granularity, points: [...points.values()] };
}
