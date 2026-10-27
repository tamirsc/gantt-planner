import { MS_PER_DAY, dayStart } from "@gantt-planner/engine";

export type Zoom = "day" | "week" | "month";
export const PX_PER_DAY: Record<Zoom, number> = { day: 40, week: 14, month: 4 };
export const ROW_HEIGHT = 30;
export const HEADER_HEIGHT = 48;

export interface Scale {
  /** First visible instant (midnight). */
  from: number;
  /** Last visible instant (midnight, exclusive). */
  to: number;
  pxPerDay: number;
  width: number;
  /** Mirror the axis so that earlier dates are on the right. */
  rtl: boolean;
}

export function makeScale(projectStart: number, projectFinish: number, zoom: Zoom, rtl: boolean): Scale {
  const pxPerDay = PX_PER_DAY[zoom];
  const pad = zoom === "day" ? 3 : zoom === "week" ? 7 : 30;
  const from = dayStart(projectStart) - pad * MS_PER_DAY;
  const minSpan = zoom === "day" ? 28 : zoom === "week" ? 84 : 365;
  const span = Math.max(minSpan, Math.ceil((projectFinish - from) / MS_PER_DAY) + pad * 2);
  const to = from + span * MS_PER_DAY;
  return { from, to, pxPerDay, width: span * pxPerDay, rtl };
}

/** Instant → x pixel (mirrored in RTL). */
export function xOf(scale: Scale, ms: number): number {
  const x = ((ms - scale.from) / MS_PER_DAY) * scale.pxPerDay;
  return scale.rtl ? scale.width - x : x;
}

/** x pixel → instant (inverse of xOf). */
export function msAt(scale: Scale, x: number): number {
  const px = scale.rtl ? scale.width - x : x;
  return scale.from + (px / scale.pxPerDay) * MS_PER_DAY;
}

/** Left/right pixel edges of a time span, regardless of direction. */
export function span(scale: Scale, start: number, finish: number): { x: number; w: number } {
  const a = xOf(scale, start);
  const b = xOf(scale, finish);
  const x = Math.min(a, b);
  return { x, w: Math.max(2, Math.abs(b - a)) };
}

export function* eachDay(scale: Scale): Generator<number> {
  for (let d = scale.from; d < scale.to; d += MS_PER_DAY) yield d;
}

/** Start of the ISO-ish week (Sunday-based for the Israeli convention). */
export function weekStart(ms: number): number {
  const d = dayStart(ms);
  return d - new Date(d).getUTCDay() * MS_PER_DAY;
}

export function monthStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1);
}
export function nextMonth(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1);
}
