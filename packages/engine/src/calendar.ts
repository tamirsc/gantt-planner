import { MS_PER_DAY, MS_PER_MINUTE, dayStart, utc, weekday } from "./time.js";

/** Half-open working interval within a day, in minutes from midnight: [from, to). */
export interface TimeInterval {
  from: number;
  to: number;
}

/**
 * A calendar exception overrides the weekday pattern for a date range
 * (inclusive). Empty `intervals` means the whole range is non-working
 * (holiday); non-empty intervals define special working hours.
 */
export interface CalendarException {
  name?: string;
  /** "YYYY-MM-DD" */
  from: string;
  /** "YYYY-MM-DD", inclusive. Defaults to `from`. */
  to?: string;
  intervals: TimeInterval[];
}

export interface CalendarDefinition {
  id: string;
  name?: string;
  /** Index 0 = Sunday … 6 = Saturday. An empty array means a non-working day. */
  weekDays: [TimeInterval[], TimeInterval[], TimeInterval[], TimeInterval[], TimeInterval[], TimeInterval[], TimeInterval[]];
  exceptions?: CalendarException[];
  /**
   * Working minutes that make up one "day" when converting durations
   * (MS Project: Options → Schedule → Hours per day). Defaults to the
   * working minutes of the first working weekday.
   */
  minutesPerDay?: number;
}

const MAX_SEARCH_DAYS = 365 * 50;

interface NormalizedException {
  fromDay: number;
  toDay: number;
  intervals: TimeInterval[];
}

/**
 * Working-time arithmetic over a calendar definition. Instances are
 * immutable and cheap; the scheduler creates one per calendar definition.
 */
export class WorkCalendar {
  readonly id: string;
  readonly name: string;
  readonly minutesPerDay: number;
  private readonly weekDays: TimeInterval[][];
  private readonly exceptions: NormalizedException[];

  constructor(def: CalendarDefinition) {
    this.id = def.id;
    this.name = def.name ?? def.id;
    this.weekDays = def.weekDays.map((ivs) => normalizeIntervals(ivs));
    this.exceptions = (def.exceptions ?? []).map((ex) => ({
      fromDay: utc(ex.from),
      toDay: utc(ex.to ?? ex.from),
      intervals: normalizeIntervals(ex.intervals),
    }));
    for (const ex of this.exceptions) {
      if (ex.toDay < ex.fromDay) throw new Error(`Calendar ${def.id}: exception range ends before it starts`);
    }
    this.minutesPerDay =
      def.minutesPerDay ??
      this.weekDays.map(sumIntervals).find((m) => m > 0) ??
      0;
    if (this.minutesPerDay <= 0) throw new Error(`Calendar ${def.id} has no working time`);
  }

  /** Working intervals (absolute ms) for the day containing `ms`. */
  intervalsOn(ms: number): Array<{ start: number; end: number }> {
    const day = dayStart(ms);
    let ivs: TimeInterval[] | undefined;
    // Later exceptions win, matching MS Project's "last defined" behaviour.
    for (let i = this.exceptions.length - 1; i >= 0; i--) {
      const ex = this.exceptions[i]!;
      if (day >= ex.fromDay && day <= ex.toDay) {
        ivs = ex.intervals;
        break;
      }
    }
    if (!ivs) ivs = this.weekDays[weekday(day)]!;
    return ivs.map((iv) => ({ start: day + iv.from * MS_PER_MINUTE, end: day + iv.to * MS_PER_MINUTE }));
  }

  isWorkingDay(ms: number): boolean {
    return this.intervalsOn(ms).length > 0;
  }

  isWorkingTime(ms: number): boolean {
    return this.intervalsOn(ms).some((iv) => ms >= iv.start && ms < iv.end);
  }

  /**
   * Earliest instant t ≥ ms at which work can START. If `ms` falls inside a
   * working interval it is returned unchanged; the end of an interval is not a
   * valid start, so it rolls to the next interval.
   */
  nextWorkingTime(ms: number): number {
    let day = dayStart(ms);
    for (let n = 0; n < MAX_SEARCH_DAYS; n++, day += MS_PER_DAY) {
      for (const iv of this.intervalsOn(day)) {
        if (ms < iv.start) return iv.start;
        if (ms < iv.end) return ms;
      }
    }
    throw new Error(`Calendar ${this.id}: no working time found after ${new Date(ms).toISOString()}`);
  }

  /**
   * Latest instant t ≤ ms at which work can FINISH. If `ms` falls strictly
   * inside a working interval, or exactly at its end, it is returned
   * unchanged; the start of an interval is not a valid finish.
   */
  prevWorkingTime(ms: number): number {
    let day = dayStart(ms);
    for (let n = 0; n < MAX_SEARCH_DAYS; n++, day -= MS_PER_DAY) {
      const ivs = this.intervalsOn(day);
      for (let i = ivs.length - 1; i >= 0; i--) {
        const iv = ivs[i]!;
        if (ms > iv.end) return iv.end;
        if (ms > iv.start) return ms;
      }
    }
    throw new Error(`Calendar ${this.id}: no working time found before ${new Date(ms).toISOString()}`);
  }

  /**
   * Move `minutes` of working time forward (positive) or backward (negative)
   * from `ms`. Zero returns `ms` unchanged (milestones keep their raw instant).
   */
  addMinutes(ms: number, minutes: number): number {
    if (!Number.isFinite(minutes)) throw new Error("addMinutes: minutes must be finite");
    if (minutes === 0) return ms;
    if (minutes > 0) {
      let t = this.nextWorkingTime(ms);
      let remaining = minutes * MS_PER_MINUTE;
      for (let guard = 0; guard < MAX_SEARCH_DAYS * 8; guard++) {
        const iv = this.intervalsOn(t).find((x) => t >= x.start && t < x.end)!;
        const avail = iv.end - t;
        if (remaining <= avail) return t + remaining;
        remaining -= avail;
        t = this.nextWorkingTime(iv.end);
      }
    } else {
      let t = this.prevWorkingTime(ms);
      let remaining = -minutes * MS_PER_MINUTE;
      for (let guard = 0; guard < MAX_SEARCH_DAYS * 8; guard++) {
        const iv = this.intervalsOn(t).find((x) => t > x.start && t <= x.end)!;
        const avail = t - iv.start;
        if (remaining <= avail) return t - remaining;
        remaining -= avail;
        t = this.prevWorkingTime(iv.start);
      }
    }
    throw new Error(`Calendar ${this.id}: addMinutes exceeded search range`);
  }

  /** Signed working minutes from `a` to `b` (negative when b < a). */
  workingMinutesBetween(a: number, b: number): number {
    if (a === b) return 0;
    if (a > b) return -this.workingMinutesBetween(b, a);
    let total = 0;
    const lastDay = dayStart(b);
    for (let day = dayStart(a); day <= lastDay; day += MS_PER_DAY) {
      for (const iv of this.intervalsOn(day)) {
        const s = Math.max(iv.start, a);
        const e = Math.min(iv.end, b);
        if (e > s) total += e - s;
      }
    }
    return total / MS_PER_MINUTE;
  }

  /** Convert working days to working minutes using this calendar's day length. */
  days(n: number): number {
    return Math.round(n * this.minutesPerDay);
  }

  /** Convert working minutes to working days using this calendar's day length. */
  toDays(minutes: number): number {
    return minutes / this.minutesPerDay;
  }
}

function normalizeIntervals(ivs: TimeInterval[]): TimeInterval[] {
  const sorted = [...ivs].sort((x, y) => x.from - y.from);
  for (let i = 0; i < sorted.length; i++) {
    const iv = sorted[i]!;
    if (iv.from < 0 || iv.to > 24 * 60 || iv.from >= iv.to) {
      throw new Error(`Invalid working interval ${iv.from}-${iv.to}`);
    }
    if (i > 0 && iv.from < sorted[i - 1]!.to) throw new Error("Overlapping working intervals");
  }
  return sorted;
}

function sumIntervals(ivs: TimeInterval[]): number {
  return ivs.reduce((acc, iv) => acc + (iv.to - iv.from), 0);
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

const H = (h: number, m = 0) => h * 60 + m;
const STANDARD_DAY: TimeInterval[] = [
  { from: H(8), to: H(12) },
  { from: H(13), to: H(17) },
];
const OFF: TimeInterval[] = [];

/** Sunday–Thursday, 08:00–12:00 and 13:00–17:00. Add holidays via `exceptions`. */
export const israelStandard: CalendarDefinition = {
  id: "il-standard",
  name: "Israel Standard (Sun–Thu)",
  weekDays: [STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, OFF, OFF],
};

/** Monday–Friday, 08:00–12:00 and 13:00–17:00 (MS Project "Standard"). */
export const standardMonFri: CalendarDefinition = {
  id: "standard",
  name: "Standard (Mon–Fri)",
  weekDays: [OFF, STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, STANDARD_DAY, OFF],
};

/** Every day, 00:00–24:00 (MS Project "24 Hours"). */
export const twentyFourHours: CalendarDefinition = {
  id: "24h",
  name: "24 Hours",
  weekDays: Array.from({ length: 7 }, () => [{ from: 0, to: 24 * 60 }]) as CalendarDefinition["weekDays"],
  minutesPerDay: 24 * 60,
};

export const presetCalendars: readonly CalendarDefinition[] = [israelStandard, standardMonFri, twentyFourHours];
