/**
 * Time primitives. All instants are epoch milliseconds interpreted as
 * "project time" using UTC arithmetic. The application layer is responsible
 * for mapping a user's local wall-clock time to this scale.
 */
export const MS_PER_MINUTE = 60_000;
export const MS_PER_DAY = 86_400_000;

/** Midnight (UTC) of the day containing `ms`. */
export function dayStart(ms: number): number {
  return Math.floor(ms / MS_PER_DAY) * MS_PER_DAY;
}

/** 0 = Sunday … 6 = Saturday, UTC. */
export function weekday(ms: number): number {
  return new Date(dayStart(ms)).getUTCDay();
}

/** Parse "YYYY-MM-DD" or "YYYY-MM-DDTHH:MM" as UTC. */
export function utc(iso: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(iso);
  if (!m) throw new Error(`Invalid date literal: ${iso}`);
  const [, y, mo, d, h = "0", mi = "0", s = "0"] = m;
  return Date.UTC(+y!, +mo! - 1, +d!, +h, +mi, +s);
}

/** Format as "YYYY-MM-DDTHH:MM" (UTC) for logs and tests. */
export function fmt(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}
