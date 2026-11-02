import type { Lang } from "../i18n";
import { locale } from "../i18n";

const cache = new Map<string, Intl.DateTimeFormat>();
function dtf(lang: Lang, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = lang + JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale[lang], { timeZone: "UTC", ...opts });
    cache.set(key, f);
  }
  return f;
}

/** Project time is UTC-based; format without converting to the browser zone. */
export function fmtDate(lang: Lang, ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return dtf(lang, { day: "2-digit", month: "2-digit", year: "2-digit" }).format(ms);
}
export function fmtDateTime(lang: Lang, ms: number): string {
  if (!Number.isFinite(ms)) return "";
  return dtf(lang, { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }).format(ms);
}
export function fmtDayNumber(lang: Lang, ms: number): string {
  return dtf(lang, { day: "numeric" }).format(ms);
}
export function fmtWeekday(lang: Lang, ms: number): string {
  return dtf(lang, { weekday: "narrow" }).format(ms);
}
export function fmtMonth(lang: Lang, ms: number): string {
  return dtf(lang, { month: "long", year: "numeric" }).format(ms);
}
export function fmtShortMonthDay(lang: Lang, ms: number): string {
  return dtf(lang, { day: "numeric", month: "numeric" }).format(ms);
}

/** Working minutes → "3d", "0.5d", "2h". */
export function fmtDuration(minutes: number, minutesPerDay: number, lang: Lang): string {
  if (minutes === 0) return "0";
  const days = minutes / minutesPerDay;
  const rounded = Math.round(days * 100) / 100;
  if (lang === "he") return `${rounded} ${Math.abs(rounded) === 1 ? "יום" : "ימים"}`;
  if (lang === "de") return `${rounded} T`;
  if (lang === "it") return `${rounded} g`;
  return `${rounded}d`;
}

/** "3", "3d", "2.5", "4h", "2w" → working minutes. Returns undefined for invalid text. */
export function parseDuration(text: string, minutesPerDay: number): number | undefined {
  const m = /^\s*(-?\d+(?:[.,]\d+)?)\s*([a-zA-Zא-ת']*)\s*$/.exec(text);
  if (!m) return undefined;
  const n = Number(m[1]!.replace(",", "."));
  if (!Number.isFinite(n) || n < 0) return undefined;
  const unit = (m[2] ?? "").toLowerCase();
  const dayUnits = ["", "d", "day", "days", "י'", "י", "ימים", "יום", "t", "tag", "tage", "g", "gg", "giorno", "giorni"];
  const hourUnits = ["h", "hr", "hours", "ש", "ש'", "שעות", "std", "std.", "stunden", "ore", "ora"];
  const minuteUnits = ["m", "min", "דק", "דקות", "minuten", "minuti"];
  const weekUnits = ["w", "wk", "weeks", "שב", "שבועות", "wo", "woche", "wochen", "sett", "settimana", "settimane"];
  if (dayUnits.includes(unit)) return Math.round(n * minutesPerDay);
  if (hourUnits.includes(unit)) return Math.round(n * 60);
  if (minuteUnits.includes(unit)) return Math.round(n);
  if (weekUnits.includes(unit)) return Math.round(n * minutesPerDay * 5);
  return undefined;
}
