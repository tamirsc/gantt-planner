import { utc } from "@gantt-planner/engine";

/** "2026-11-01T08:00:00" → epoch ms (project time). Returns undefined for empty values. */
export function parseDateTime(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v);
  const m = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?)?/.exec(s);
  if (!m) throw new Error(`Invalid MSPDI dateTime: ${s}`);
  return utc(m[2] ? `${m[1]}T${m[2]}` : m[1]!);
}

/** epoch ms → "2026-11-01T08:00:00" */
export function formatDateTime(ms: number): string {
  return new Date(ms).toISOString().slice(0, 19);
}

/** "PT16H0M0S" → minutes. */
export function parseTimeSpan(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v);
  const m = /^(-)?P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+(?:\.\d+)?)S)?)?$/.exec(s);
  if (!m) throw new Error(`Invalid MSPDI duration: ${s}`);
  const sign = m[1] ? -1 : 1;
  const days = Number(m[2] ?? 0);
  const hours = Number(m[3] ?? 0);
  const minutes = Number(m[4] ?? 0);
  const seconds = Number(m[5] ?? 0);
  return sign * (days * 24 * 60 + hours * 60 + minutes + seconds / 60);
}

/** minutes → "PT16H0M0S" (MS Project writes hours/minutes/seconds only). */
export function formatTimeSpan(minutes: number): string {
  const total = Math.round(minutes * 60);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h}H${m}M${s}S`;
}

/** "08:00:00" → minutes from midnight. "00:00:00" as an end time means 24:00. */
export function parseClockTime(v: unknown, asEnd = false): number {
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(String(v));
  if (!m) throw new Error(`Invalid MSPDI time: ${String(v)}`);
  const minutes = Number(m[1]) * 60 + Number(m[2]);
  return asEnd && minutes === 0 ? 24 * 60 : minutes;
}

export function formatClockTime(minutes: number): string {
  const mm = minutes % (24 * 60);
  const h = Math.floor(mm / 60);
  const m = mm % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

export function toInt(v: unknown): number | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

export function toBool(v: unknown): boolean | undefined {
  if (v === undefined || v === null || v === "") return undefined;
  const s = String(v).toLowerCase();
  return s === "1" || s === "true";
}

export function asArray<T>(v: T | T[] | undefined): T[] {
  if (v === undefined || v === null) return [];
  return Array.isArray(v) ? v : [v];
}

export function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
