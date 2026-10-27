import { describe, expect, it } from "vitest";
import { schedule } from "../src/schedule.js";
import { assignResource, setAssignmentUnits, setTaskDuration, setTaskWork, unassignResource } from "../src/assignments.js";
import { clearBaseline, takeBaseline } from "../src/baseline.js";
import { standardMonFri } from "../src/calendar.js";
import { fmt, utc } from "../src/time.js";
import type { ProjectInput } from "../src/types.js";

const D = 480;
const START = utc("2026-11-01"); // Sunday

const base = (): ProjectInput => ({
  start: START,
  resources: [
    { id: "dana", name: "Dana", standardRate: 100 },
    { id: "us", name: "US engineer", calendarId: standardMonFri.id, standardRate: 150 },
    { id: "cement", name: "Cement", type: "material", standardRate: 20 },
    { id: "permit", name: "Permit fee", type: "cost" },
  ],
  tasks: [
    { id: "a", name: "A", duration: 2 * D },
    { id: "b", name: "B", duration: 3 * D },
    { id: "s", name: "Phase" },
    { id: "c", name: "C", parentId: "s", duration: 1 * D, fixedCost: 500 },
  ],
  dependencies: [{ predecessorId: "a", successorId: "b" }],
  assignments: [
    { taskId: "a", resourceId: "dana" },
    { taskId: "b", resourceId: "dana", units: 0.5 },
    { taskId: "c", resourceId: "cement", units: 10 },
    { taskId: "c", resourceId: "permit", cost: 1200 },
  ],
});

describe("assignments, work and cost", () => {
  it("derives work = duration × units and costs from rates", () => {
    const r = schedule(base());
    const a = r.assignments.find((x) => x.taskId === "a")!;
    expect(a.work).toBe(2 * D);
    expect(a.cost).toBe((2 * D) / 60 * 100); // 16h × 100
    const b = r.assignments.find((x) => x.taskId === "b")!;
    expect(b.work).toBe(1.5 * D);
    expect(r.tasks["a"]!.work).toBe(2 * D);
    expect(r.tasks["c"]!.cost).toBe(10 * 20 + 1200 + 500);
    expect(r.tasks["s"]!.cost).toBe(r.tasks["c"]!.cost);
    expect(r.resources["dana"]!.work).toBe(3.5 * D);
    expect(r.resources["dana"]!.cost).toBe((3.5 * D) / 60 * 100);
    expect(r.cost).toBe(r.tasks["a"]!.cost + r.tasks["b"]!.cost + r.tasks["s"]!.cost);
    expect(r.work).toBe(3.5 * D);
  });

  it("detects overallocation per day against the resource's own calendar", () => {
    const p = base();
    p.tasks.push({ id: "d", name: "D", duration: 2 * D }); // parallel with A, Sun–Mon
    p.assignments!.push({ taskId: "d", resourceId: "dana" });
    const r = schedule(p);
    const dana = r.resources["dana"]!;
    expect(dana.isOverallocated).toBe(true);
    expect(dana.overallocatedDays.map((d) => fmt(d).slice(0, 10))).toEqual(["2026-11-01", "2026-11-02"]);
    expect(dana.peakUnits).toBe(2);
    expect(r.warnings.some((w) => w.code === "RESOURCE_OVERALLOCATED" && w.taskId === "dana")).toBe(true);
  });

  it("is not overallocated when units fit within maxUnits", () => {
    const p = base();
    p.resources![0]!.maxUnits = 2;
    p.tasks.push({ id: "d", name: "D", duration: 2 * D });
    p.assignments!.push({ taskId: "d", resourceId: "dana" });
    expect(schedule(p).resources["dana"]!.isOverallocated).toBe(false);
  });

  it("flags a US-calendar resource working on an Israeli Sunday", () => {
    const p = base();
    p.assignments!.push({ taskId: "a", resourceId: "us" }); // task A runs Sun–Mon on the IL calendar
    const r = schedule(p);
    const us = r.resources["us"]!;
    // Sunday has zero capacity for the US engineer, so that day is overallocated; Monday is fine.
    expect(us.overallocatedDays.map((d) => fmt(d).slice(0, 10))).toEqual(["2026-11-01"]);
  });

  it("warns about assignments to unknown tasks or resources", () => {
    const p = base();
    p.assignments!.push({ taskId: "zzz", resourceId: "dana" });
    expect(schedule(p).warnings.map((w) => w.code)).toContain("UNKNOWN_ASSIGNMENT_TARGET");
  });
});

describe("task type arithmetic", () => {
  const work = (p: ProjectInput, taskId: string) => schedule(p).tasks[taskId]!.work;
  const duration = (p: ProjectInput, taskId: string) => p.tasks.find((t) => t.id === taskId)!.duration;
  const units = (p: ProjectInput, taskId: string, rid: string) => p.assignments!.find((a) => a.taskId === taskId && a.resourceId === rid)!.units;

  it("fixed units: changing duration changes work", () => {
    const p = setTaskDuration(base(), "a", 4 * D);
    expect(work(p, "a")).toBe(4 * D);
    expect(units(p, "a", "dana")).toBeUndefined(); // untouched (defaults to 1)
  });

  it("fixed units: changing work changes duration", () => {
    const p = setTaskWork(base(), "b", 3 * D); // b has dana at 50%
    expect(duration(p, "b")).toBe(6 * D);
  });

  it("fixed duration: changing work changes units", () => {
    const p0 = base();
    p0.tasks[1]!.taskType = "fixedDuration";
    const p = setTaskWork(p0, "b", 3 * D);
    expect(duration(p, "b")).toBe(3 * D);
    expect(units(p, "b", "dana")).toBe(1);
  });

  it("fixed work: changing duration changes units", () => {
    const p0 = base();
    p0.tasks[0]!.taskType = "fixedWork";
    const p = setTaskDuration(p0, "a", 4 * D);
    expect(work(p, "a")).toBe(2 * D);
    expect(units(p, "a", "dana")).toBe(0.5);
  });

  it("fixed work: changing units changes duration", () => {
    const p0 = base();
    p0.tasks[0]!.taskType = "fixedWork";
    const p = setAssignmentUnits(p0, "a", "dana", 2);
    expect(duration(p, "a")).toBe(1 * D);
    expect(work(p, "a")).toBe(2 * D);
  });

  it("effort-driven: adding a resource shortens the task, removing lengthens it", () => {
    const p0 = base();
    p0.tasks[0]!.effortDriven = true;
    const p1 = assignResource(p0, "a", "us");
    expect(duration(p1, "a")).toBe(1 * D);
    expect(work(p1, "a")).toBe(2 * D);
    const p2 = unassignResource(p1, "a", "dana");
    expect(duration(p2, "a")).toBe(2 * D);
    expect(work(p2, "a")).toBe(2 * D);
  });

  it("non effort-driven: adding a resource adds work and keeps the duration", () => {
    const p = assignResource(base(), "a", "us");
    expect(duration(p, "a")).toBe(2 * D);
    expect(work(p, "a")).toBe(4 * D);
    // material and cost resources never change the schedule
    const q = assignResource(base(), "a", "cement", 5);
    expect(duration(q, "a")).toBe(2 * D);
    expect(work(q, "a")).toBe(2 * D);
  });

  it("is idempotent for repeated assignment and tolerant of unknown targets", () => {
    const p = assignResource(base(), "a", "dana");
    expect(p.assignments!.filter((a) => a.taskId === "a").length).toBe(1);
    expect(() => assignResource(base(), "a", "nobody")).toThrow(/Unknown resource/);
    expect(() => setTaskWork(base(), "s", D)).toThrow(/no work resources/);
  });
});

describe("baselines", () => {
  it("records the schedule and reports variances after changes", () => {
    const p0 = base();
    const r0 = schedule(p0);
    const p1 = takeBaseline(p0, r0, 0, utc("2026-10-27"));
    expect(p1.baselines!.length).toBe(1);
    expect(p1.baselines![0]!.tasks["b"]).toEqual({ start: r0.tasks["b"]!.start, finish: r0.tasks["b"]!.finish, duration: 3 * D, work: 1.5 * D, cost: r0.tasks["b"]!.cost });

    const r1 = schedule(p1);
    expect(r1.tasks["b"]!.startVariance).toBe(0);
    expect(r1.tasks["b"]!.baseline?.finish).toBe(r0.tasks["b"]!.finish);

    const p2 = setTaskDuration(p1, "a", 4 * D); // A grows by 2 days → B slips 2 days
    const r2 = schedule(p2);
    expect(r2.tasks["b"]!.startVariance).toBe(2 * D);
    expect(r2.tasks["b"]!.finishVariance).toBe(2 * D);
    expect(r2.tasks["b"]!.workVariance).toBe(0);
    expect(r2.tasks["a"]!.workVariance).toBe(2 * D);
    expect(r2.tasks["a"]!.costVariance).toBe((2 * D) / 60 * 100);
    expect(r2.tasks["s"]!.startVariance).toBe(0);
  });

  it("keeps up to eleven baselines and clears them individually", () => {
    const p0 = base();
    const r0 = schedule(p0);
    let p = takeBaseline(p0, r0, 0);
    p = takeBaseline(p, r0, 3);
    p = takeBaseline(p, r0, 0); // replaces
    expect(p.baselines!.map((b) => b.index)).toEqual([0, 3]);
    p = clearBaseline(p, 0);
    expect(p.baselines!.map((b) => b.index)).toEqual([3]);
    expect(schedule(p).tasks["a"]!.baseline).toBeNull();
    expect(() => takeBaseline(p0, r0, 11)).toThrow();
  });
});
