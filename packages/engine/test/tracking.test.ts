import { describe, expect, it } from "vitest";
import { schedule } from "../src/schedule.js";
import { takeBaseline } from "../src/baseline.js";
import { fmt, utc } from "../src/time.js";
import type { ProjectInput } from "../src/types.js";

const D = 480;
const START = utc("2026-11-01"); // Sunday, Israel calendar

const chain = (): ProjectInput => ({
  start: START,
  resources: [{ id: "dana", standardRate: 100 }],
  tasks: [
    { id: "a", name: "A", duration: 2 * D },
    { id: "b", name: "B", duration: 3 * D },
    { id: "s", name: "Phase" },
    { id: "c", name: "C", parentId: "s", duration: 2 * D },
    { id: "d", name: "D", parentId: "s", duration: 2 * D },
  ],
  dependencies: [
    { predecessorId: "a", successorId: "b" },
    { predecessorId: "c", successorId: "d" },
  ],
  assignments: [{ taskId: "a", resourceId: "dana" }],
});
const dates = (r: ReturnType<typeof schedule>, id: string) => `${fmt(r.tasks[id]!.start)} .. ${fmt(r.tasks[id]!.finish)}`;

describe("progress", () => {
  it("derives actual and remaining duration and work from percent complete", () => {
    const p = chain();
    p.tasks[0]!.percentComplete = 50;
    const r = schedule(p);
    const a = r.tasks["a"]!;
    expect(a.actualDuration).toBe(D);
    expect(a.remainingDuration).toBe(D);
    expect(a.actualWork).toBe(D);
    expect(a.remainingWork).toBe(D);
    expect(fmt(a.actualStart!)).toBe("2026-11-01T08:00");
    expect(a.actualFinish).toBeNull();
    expect(fmt(a.stop!)).toBe("2026-11-01T17:00");
    expect(fmt(a.resume!)).toBe("2026-11-01T17:00");
    expect(dates(r, "a")).toBe("2026-11-01T08:00 .. 2026-11-02T17:00"); // unchanged without a status date
  });

  it("pins the start to the actual start and shifts successors", () => {
    const p = chain();
    p.tasks[0]!.actualStart = utc("2026-11-03T08:00");
    p.tasks[0]!.percentComplete = 25;
    const r = schedule(p);
    expect(dates(r, "a")).toBe("2026-11-03T08:00 .. 2026-11-04T17:00");
    expect(dates(r, "b")).toBe("2026-11-05T08:00 .. 2026-11-09T17:00");
    expect(r.warnings).toEqual([]);
  });

  it("completes a task at its actual finish and recomputes its duration", () => {
    const p = chain();
    p.tasks[0]!.actualStart = utc("2026-11-01T08:00");
    p.tasks[0]!.actualFinish = utc("2026-11-03T12:00"); // took 2.5 days instead of 2
    const r = schedule(p);
    const a = r.tasks["a"]!;
    expect(a.percentComplete).toBe(100);
    expect(a.duration).toBe(2.5 * D);
    expect(a.actualDuration).toBe(2.5 * D);
    expect(a.remainingDuration).toBe(0);
    expect(fmt(a.actualFinish!)).toBe("2026-11-03T12:00");
    expect(a.isCritical).toBe(false); // finished work is never critical
    expect(dates(r, "b")).toBe("2026-11-03T13:00 .. 2026-11-08T12:00");
  });

  it("treats an actual finish without an actual start as finished on time", () => {
    const p = chain();
    p.tasks[0]!.actualFinish = utc("2026-11-02T17:00");
    const r = schedule(p);
    expect(fmt(r.tasks["a"]!.actualStart!)).toBe("2026-11-01T08:00");
    expect(r.tasks["a"]!.percentComplete).toBe(100);
  });

  it("rolls percent complete up to summaries and the project", () => {
    const p = chain();
    p.tasks[3]!.percentComplete = 100; // C done
    p.tasks[4]!.percentComplete = 50; // D half
    const r = schedule(p);
    expect(r.tasks["s"]!.percentComplete).toBe(75);
    expect(r.tasks["s"]!.actualDuration).toBe(3 * D);
    expect(r.tasks["s"]!.actualFinish).toBeNull();
    expect(fmt(r.tasks["s"]!.actualStart!)).toBe("2026-11-01T08:00");
    expect(r.percentComplete).toBe(Math.round((3 / 9) * 10000) / 100);
  });
});

describe("status date", () => {
  it("moves remaining work of in-progress tasks and unstarted tasks after the status date", () => {
    const p = chain();
    p.statusDate = utc("2026-11-05T08:00"); // Thursday
    p.options = { rescheduleUncompletedWork: true };
    p.tasks[0]!.percentComplete = 50; // A did one day (Sun), then stalled
    const r = schedule(p);
    const a = r.tasks["a"]!;
    expect(fmt(a.stop!)).toBe("2026-11-01T17:00");
    expect(fmt(a.resume!)).toBe("2026-11-05T08:00");
    expect(dates(r, "a")).toBe("2026-11-01T08:00 .. 2026-11-05T17:00");
    expect(dates(r, "b")).toBe("2026-11-08T08:00 .. 2026-11-10T17:00");
    // unstarted C moves to the status date as well
    expect(dates(r, "c")).toBe("2026-11-05T08:00 .. 2026-11-08T17:00");
  });

  it("leaves dates alone when the option is off", () => {
    const p = chain();
    p.statusDate = utc("2026-11-05T08:00");
    p.tasks[0]!.percentComplete = 50;
    const r = schedule(p);
    expect(dates(r, "a")).toBe("2026-11-01T08:00 .. 2026-11-02T17:00");
    expect(r.statusDate).toBe(p.statusDate);
  });
});

describe("earned value", () => {
  it("computes PV, EV, AC and indices against baseline 0 at the status date", () => {
    const p0 = chain();
    const p1 = takeBaseline(p0, schedule(p0));
    p1.statusDate = utc("2026-11-02T12:00"); // 1.5 of A's 2 days planned
    p1.tasks[0]!.percentComplete = 50;
    const r = schedule(p1);
    const ev = r.tasks["a"]!.earnedValue!;
    expect(ev.pv).toBeCloseTo(1200); // 1600 × 0.75
    expect(ev.ev).toBeCloseTo(800);
    expect(ev.ac).toBeCloseTo(800);
    expect(ev.sv).toBeCloseTo(-400);
    expect(ev.cv).toBeCloseTo(0);
    expect(ev.spi).toBeCloseTo(800 / 1200);
    expect(ev.cpi).toBeCloseTo(1);
    // tasks without cost contribute zero; project totals equal task A's
    expect(r.earnedValue!.pv).toBeCloseTo(1200);
    expect(r.tasks["b"]!.earnedValue).toEqual({ pv: 0, ev: 0, ac: 0, sv: 0, cv: 0, spi: null, cpi: null });
  });

  it("is null without a baseline or without a status date", () => {
    const withStatus = chain();
    withStatus.statusDate = utc("2026-11-02");
    expect(schedule(withStatus).tasks["a"]!.earnedValue).toBeNull(); // no baseline
    const withBaseline = takeBaseline(chain(), schedule(chain()));
    expect(schedule(withBaseline).earnedValue).toBeNull(); // no status date
  });
});
