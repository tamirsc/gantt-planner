import { describe, expect, it } from "vitest";
import { fmt, schedule, standardMonFri, takeBaseline, utc, type ProjectInput } from "@gantt-planner/engine";
import { readMspdi } from "../src/reader.js";
import { writeMspdi } from "../src/writer.js";

const D = 480;

const project = (): ProjectInput => ({
  start: utc("2026-11-01"),
  resources: [
    { id: "1", name: "דנה", standardRate: 100 },
    { id: "2", name: "US engineer", calendarId: standardMonFri.id, standardRate: 150, maxUnits: 2 },
    { id: "3", name: "Cement", type: "material", standardRate: 20 },
    { id: "4", name: "Permit", type: "cost" },
  ],
  tasks: [
    { id: "1", name: "A", duration: 2 * D, taskType: "fixedWork", effortDriven: true },
    { id: "2", name: "B", duration: 3 * D, fixedCost: 250 },
    { id: "3", name: "Phase" },
    { id: "4", name: "C", parentId: "3", duration: 1 * D },
  ],
  dependencies: [{ predecessorId: "1", successorId: "2" }],
  assignments: [
    { taskId: "1", resourceId: "1" },
    { taskId: "1", resourceId: "2", units: 0.5 },
    { taskId: "2", resourceId: "1", units: 0.5, work: 1.5 * D },
    { taskId: "4", resourceId: "3", units: 10 },
    { taskId: "4", resourceId: "4", cost: 1200 },
  ],
});

describe("resources, assignments and baselines in MSPDI", () => {
  it("round-trips resources, assignments, task types, costs and baselines", () => {
    const p0 = project();
    const p1 = takeBaseline(p0, schedule(p0), 0, utc("2026-10-27"));
    const r1 = schedule(p1);
    const xml = writeMspdi(p1, { name: "Res", result: r1 });

    expect(xml).toContain("<Resources>");
    expect(xml).toContain("<Name>דנה</Name>");
    expect(xml).toContain("<Type>2</Type>"); // fixed work task and cost resource
    expect(xml).toContain("<EffortDriven>1</EffortDriven>");
    expect(xml).toContain("<FixedCost>250</FixedCost>");
    expect(xml).toContain("<Baseline>");
    expect(xml).toContain("<Units>0.5</Units>");

    const doc = readMspdi(xml);
    expect(doc.warnings).toEqual([]);
    expect(doc.project.resources).toEqual([
      { id: "1", name: "דנה", standardRate: 100 },
      { id: "2", name: "US engineer", calendarId: "2", standardRate: 150, maxUnits: 2 },
      { id: "3", name: "Cement", type: "material", standardRate: 20 },
      { id: "4", name: "Permit", type: "cost" },
    ]);
    expect(doc.project.tasks.find((t) => t.id === "1")).toMatchObject({ taskType: "fixedWork", effortDriven: true });
    expect(doc.project.tasks.find((t) => t.id === "2")).toMatchObject({ fixedCost: 250 });
    expect(doc.project.assignments).toHaveLength(5);
    expect(doc.project.assignments!.find((a) => a.taskId === "4" && a.resourceId === "4")).toEqual({ taskId: "4", resourceId: "4", cost: 1200, work: 0 });
    expect(doc.project.baselines).toHaveLength(1);
    expect(doc.project.baselines![0]!.tasks["2"]).toEqual(p1.baselines![0]!.tasks["2"]);

    const r2 = schedule(doc.project);
    for (const id of r1.order) {
      const a = r1.tasks[id]!;
      const b = r2.tasks[id]!;
      expect([b.name, fmt(b.start), fmt(b.finish), b.work, b.cost, b.startVariance]).toEqual([a.name, fmt(a.start), fmt(a.finish), a.work, a.cost, a.startVariance]);
    }
    expect(r2.resources["2"]!.work).toBe(r1.resources["2"]!.work);
    expect(doc.stored["2"]!.work).toBe(r1.tasks["2"]!.work);
    expect(doc.stored["2"]!.cost).toBe(r1.tasks["2"]!.cost);
  });

  it("converts daily rates to hourly and skips the Unassigned placeholder resource", () => {
    const xml = `<?xml version="1.0"?><Project xmlns="http://schemas.microsoft.com/project">
      <StartDate>2026-11-02T08:00:00</StartDate><MinutesPerDay>480</MinutesPerDay>
      <Calendars><Calendar><UID>1</UID><Name>Standard</Name><IsBaseCalendar>1</IsBaseCalendar><WeekDays>
        <WeekDay><DayType>2</DayType><DayWorking>1</DayWorking><WorkingTimes><WorkingTime><FromTime>08:00:00</FromTime><ToTime>16:00:00</ToTime></WorkingTime></WorkingTimes></WeekDay>
      </WeekDays></Calendar></Calendars>
      <Tasks><Task><UID>1</UID><Name>T</Name><OutlineLevel>1</OutlineLevel><Duration>PT8H0M0S</Duration></Task></Tasks>
      <Resources>
        <Resource><UID>0</UID><Name>Unassigned</Name><Type>1</Type></Resource>
        <Resource><UID>7</UID><Name>Daily</Name><Type>1</Type><StandardRate>800</StandardRate><StandardRateFormat>3</StandardRateFormat></Resource>
      </Resources>
      <Assignments>
        <Assignment><UID>1</UID><TaskUID>1</TaskUID><ResourceUID>7</ResourceUID><Units>1</Units><Work>PT8H0M0S</Work></Assignment>
        <Assignment><UID>2</UID><TaskUID>1</TaskUID><ResourceUID>-65535</ResourceUID></Assignment>
        <Assignment><UID>3</UID><TaskUID>99</TaskUID><ResourceUID>7</ResourceUID></Assignment>
      </Assignments></Project>`;
    const doc = readMspdi(xml);
    expect(doc.project.resources).toEqual([{ id: "7", name: "Daily", standardRate: 100 }]);
    expect(doc.project.assignments).toEqual([{ taskId: "1", resourceId: "7", work: 480 }]);
    expect(doc.warnings.map((w) => w.code)).toEqual(["SKIPPED_ASSIGNMENT"]);
    expect(schedule(doc.project).tasks["1"]!.cost).toBe(800);
  });
});

describe("tracking in MSPDI", () => {
  it("round-trips the status date, actual dates and percent complete", () => {
    const p: ProjectInput = {
      start: utc("2026-11-01"),
      statusDate: utc("2026-11-05T08:00"),
      options: { rescheduleUncompletedWork: true },
      tasks: [
        { id: "1", name: "A", duration: 2 * D, actualStart: utc("2026-11-01T08:00"), percentComplete: 50 },
        { id: "2", name: "B", duration: 1 * D, actualStart: utc("2026-11-02T08:00"), actualFinish: utc("2026-11-02T17:00") },
        { id: "3", name: "C", duration: 1 * D },
      ],
      dependencies: [{ predecessorId: "1", successorId: "3" }],
    };
    const r1 = schedule(p);
    const xml = writeMspdi(p, { result: r1 });
    expect(xml).toContain("<StatusDate>2026-11-05T08:00:00</StatusDate>");
    expect(xml).toContain("<ActualStart>2026-11-01T08:00:00</ActualStart>");
    expect(xml).toContain("<ActualFinish>2026-11-02T17:00:00</ActualFinish>");
    expect(xml).toContain("<Stop>2026-11-01T17:00:00</Stop>");
    expect(xml).toContain("<Resume>2026-11-05T08:00:00</Resume>");
    const doc = readMspdi(xml);
    expect(doc.project.statusDate).toBe(p.statusDate);
    expect(doc.project.tasks[0]).toMatchObject({ actualStart: p.tasks[0]!.actualStart, percentComplete: 50 });
    expect(doc.project.tasks[1]).toMatchObject({ actualFinish: p.tasks[1]!.actualFinish, percentComplete: 100 });
    doc.project.options = p.options;
    const r2 = schedule(doc.project);
    for (const id of r1.order) expect([fmt(r2.tasks[id]!.start), fmt(r2.tasks[id]!.finish), r2.tasks[id]!.percentComplete]).toEqual([fmt(r1.tasks[id]!.start), fmt(r1.tasks[id]!.finish), r1.tasks[id]!.percentComplete]);
  });
});
