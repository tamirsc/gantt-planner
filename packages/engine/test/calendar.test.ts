import { describe, expect, it } from "vitest";
import { WorkCalendar, israelStandard, standardMonFri, twentyFourHours } from "../src/calendar.js";
import { fmt, utc } from "../src/time.js";

// 2026-11-01 is a Sunday.
const il = new WorkCalendar(israelStandard);
const us = new WorkCalendar(standardMonFri);
const h24 = new WorkCalendar(twentyFourHours);

describe("WorkCalendar basics", () => {
  it("knows working days", () => {
    expect(il.isWorkingDay(utc("2026-11-01"))).toBe(true); // Sunday
    expect(il.isWorkingDay(utc("2026-11-06"))).toBe(false); // Friday
    expect(us.isWorkingDay(utc("2026-11-01"))).toBe(false);
    expect(us.isWorkingDay(utc("2026-11-06"))).toBe(true);
    expect(il.minutesPerDay).toBe(480);
    expect(h24.minutesPerDay).toBe(1440);
  });

  it("snaps to next working time", () => {
    expect(fmt(il.nextWorkingTime(utc("2026-11-01T00:00")))).toBe("2026-11-01T08:00");
    expect(fmt(il.nextWorkingTime(utc("2026-11-01T09:30")))).toBe("2026-11-01T09:30");
    expect(fmt(il.nextWorkingTime(utc("2026-11-01T12:00")))).toBe("2026-11-01T13:00"); // lunch
    expect(fmt(il.nextWorkingTime(utc("2026-11-01T17:00")))).toBe("2026-11-02T08:00"); // end of day
    expect(fmt(il.nextWorkingTime(utc("2026-11-05T17:00")))).toBe("2026-11-08T08:00"); // Thu → Sun
    expect(fmt(us.nextWorkingTime(utc("2026-11-05T17:00")))).toBe("2026-11-06T08:00"); // Thu → Fri
  });

  it("snaps to previous working time", () => {
    expect(fmt(il.prevWorkingTime(utc("2026-11-01T17:00")))).toBe("2026-11-01T17:00");
    expect(fmt(il.prevWorkingTime(utc("2026-11-01T08:00")))).toBe("2026-10-29T17:00"); // Thu before
    expect(fmt(il.prevWorkingTime(utc("2026-11-01T12:30")))).toBe("2026-11-01T12:00");
  });

  it("adds working minutes across days and weekends", () => {
    expect(fmt(il.addMinutes(utc("2026-11-01T08:00"), 480))).toBe("2026-11-01T17:00");
    expect(fmt(il.addMinutes(utc("2026-11-01T08:00"), 960))).toBe("2026-11-02T17:00");
    expect(fmt(il.addMinutes(utc("2026-11-05T08:00"), 1440))).toBe("2026-11-09T17:00"); // Thu,Sun,Mon
    expect(fmt(us.addMinutes(utc("2026-11-05T08:00"), 1440))).toBe("2026-11-09T17:00"); // Thu,Fri,Mon
    expect(fmt(il.addMinutes(utc("2026-11-01T10:00"), 120))).toBe("2026-11-01T12:00");
    expect(fmt(il.addMinutes(utc("2026-11-01T10:00"), 121))).toBe("2026-11-01T13:01");
  });

  it("subtracts working minutes", () => {
    expect(fmt(il.addMinutes(utc("2026-11-02T17:00"), -480))).toBe("2026-11-02T08:00");
    expect(fmt(il.addMinutes(utc("2026-11-02T17:00"), -960))).toBe("2026-11-01T08:00");
    expect(fmt(il.addMinutes(utc("2026-11-08T08:00"), -1))).toBe("2026-11-05T16:59");
  });

  it("measures working minutes between instants", () => {
    expect(il.workingMinutesBetween(utc("2026-11-01T08:00"), utc("2026-11-02T17:00"))).toBe(960);
    expect(il.workingMinutesBetween(utc("2026-11-05T17:00"), utc("2026-11-08T08:00"))).toBe(0);
    expect(il.workingMinutesBetween(utc("2026-11-02T17:00"), utc("2026-11-01T08:00"))).toBe(-960);
    expect(il.workingMinutesBetween(utc("2026-11-01T00:00"), utc("2026-11-30T00:00"))).toBe(21 * 480);
  });

  it("honours exceptions (holidays and special hours)", () => {
    const cal = new WorkCalendar({
      ...israelStandard,
      id: "il-holidays",
      exceptions: [
        { name: "Holiday", from: "2026-11-02", intervals: [] },
        { name: "Half day", from: "2026-11-03", intervals: [{ from: 8 * 60, to: 12 * 60 }] },
        { name: "Working Friday", from: "2026-11-06", intervals: [{ from: 8 * 60, to: 13 * 60 }] },
      ],
    });
    expect(cal.isWorkingDay(utc("2026-11-02"))).toBe(false);
    expect(fmt(cal.addMinutes(utc("2026-11-01T08:00"), 960))).toBe("2026-11-04T12:00"); // Sun 8h, Tue 4h, Wed 4h
    expect(cal.workingMinutesBetween(utc("2026-11-06T00:00"), utc("2026-11-07T00:00"))).toBe(300);
  });

  it("rejects invalid definitions", () => {
    expect(() => new WorkCalendar({ id: "x", weekDays: [[], [], [], [], [], [], []] })).toThrow(/no working time/);
    expect(
      () => new WorkCalendar({ id: "x", weekDays: [[{ from: 600, to: 500 }], [], [], [], [], [], []] }),
    ).toThrow(/Invalid working interval/);
  });
});
