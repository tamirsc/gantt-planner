import { describe, expect, it } from "vitest";
import { schedule } from "../src/schedule.js";
import { israelStandard, standardMonFri } from "../src/calendar.js";
import { fmt, utc } from "../src/time.js";
import type { ProjectInput, TaskInput, DependencyInput } from "../src/types.js";

// 2026-11-01 is a Sunday. Israel calendar: Sun–Thu 08:00–12:00, 13:00–17:00.
const START = utc("2026-11-01");
const D = 480; // one working day in minutes

function project(tasks: TaskInput[], dependencies: DependencyInput[] = [], extra: Partial<ProjectInput> = {}): ProjectInput {
  return { start: START, tasks, dependencies, ...extra };
}
const dates = (r: ReturnType<typeof schedule>, id: string) => `${fmt(r.tasks[id]!.start)} .. ${fmt(r.tasks[id]!.finish)}`;

describe("forward pass", () => {
  it("schedules a simple FS chain", () => {
    const r = schedule(project([{ id: "A", duration: 2 * D }, { id: "B", duration: 3 * D }], [{ predecessorId: "A", successorId: "B" }]));
    expect(dates(r, "A")).toBe("2026-11-01T08:00 .. 2026-11-02T17:00");
    expect(dates(r, "B")).toBe("2026-11-03T08:00 .. 2026-11-05T17:00");
    expect(fmt(r.projectFinish)).toBe("2026-11-05T17:00");
    expect(r.criticalPath).toEqual(["A", "B"]);
    expect(r.tasks["A"]!.totalSlack).toBe(0);
    expect(r.warnings).toEqual([]);
  });

  it("computes slack for a parallel branch", () => {
    const r = schedule(
      project(
        [{ id: "A", duration: 2 * D }, { id: "C", duration: 1 * D }, { id: "B", duration: 1 * D }],
        [
          { predecessorId: "A", successorId: "B" },
          { predecessorId: "C", successorId: "B" },
        ],
      ),
    );
    expect(r.tasks["C"]!.totalSlack).toBe(D);
    expect(r.tasks["C"]!.freeSlack).toBe(D);
    expect(r.tasks["C"]!.isCritical).toBe(false);
    expect(fmt(r.tasks["C"]!.lateStart)).toBe("2026-11-02T08:00");
    expect(r.criticalPath).toEqual(["A", "B"]);
  });

  it("skips the Israeli weekend", () => {
    const r = schedule(project([{ id: "A", duration: 3 * D, constraintType: "SNET", constraintDate: utc("2026-11-05") }]));
    expect(dates(r, "A")).toBe("2026-11-05T08:00 .. 2026-11-09T17:00");
  });

  it("uses per-task calendars (IL team → US partner)", () => {
    const r = schedule(
      project(
        [
          { id: "IL", duration: 1 * D, constraintType: "SNET", constraintDate: utc("2026-11-05") },
          { id: "US", duration: 1 * D, calendarId: standardMonFri.id },
        ],
        [{ predecessorId: "IL", successorId: "US" }],
      ),
    );
    expect(dates(r, "IL")).toBe("2026-11-05T08:00 .. 2026-11-05T17:00"); // Thursday
    expect(dates(r, "US")).toBe("2026-11-06T08:00 .. 2026-11-06T17:00"); // Friday (US works, IL doesn't)
    expect(r.tasks["US"]!.calendarId).toBe("standard");
  });

  it("supports SS with lag", () => {
    const r = schedule(
      project([{ id: "A", duration: 3 * D }, { id: "B", duration: 1 * D }], [{ predecessorId: "A", successorId: "B", type: "SS", lag: D }]),
    );
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-02T17:00");
  });

  it("supports FF", () => {
    const r = schedule(project([{ id: "A", duration: 2 * D }, { id: "B", duration: 1 * D }], [{ predecessorId: "A", successorId: "B", type: "FF" }]));
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-02T17:00");
    expect(r.tasks["B"]!.totalSlack).toBe(0);
  });

  it("supports SF", () => {
    const r = schedule(
      project(
        [
          { id: "A", duration: 1 * D, constraintType: "SNET", constraintDate: utc("2026-11-10") },
          { id: "B", duration: 1 * D },
        ],
        [{ predecessorId: "A", successorId: "B", type: "SF" }],
      ),
    );
    // B must finish by the time A starts (Tue 10 Nov 08:00) → last valid finish is Mon 9 Nov 17:00.
    expect(dates(r, "B")).toBe("2026-11-09T08:00 .. 2026-11-09T17:00");
  });

  it("supports negative lag (lead)", () => {
    const r = schedule(
      project([{ id: "A", duration: 2 * D }, { id: "B", duration: 1 * D }], [{ predecessorId: "A", successorId: "B", lag: -D }]),
    );
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-02T17:00");
  });

  it("places milestones at the predecessor finish", () => {
    const r = schedule(project([{ id: "A", duration: 2 * D }, { id: "M" }], [{ predecessorId: "A", successorId: "M" }]));
    expect(r.tasks["M"]!.isMilestone).toBe(true);
    expect(dates(r, "M")).toBe("2026-11-02T17:00 .. 2026-11-02T17:00");
    expect(r.criticalPath).toEqual(["A", "M"]);
  });

  it("respects manual tasks and warns when they ignore predecessors", () => {
    const r = schedule(
      project(
        [
          { id: "A", duration: 3 * D },
          { id: "B", duration: 1 * D, schedulingMode: "manual", start: utc("2026-11-02T08:00") },
          { id: "C", duration: 1 * D },
        ],
        [
          { predecessorId: "A", successorId: "B" },
          { predecessorId: "B", successorId: "C" },
        ],
      ),
    );
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-02T17:00");
    expect(dates(r, "C")).toBe("2026-11-03T08:00 .. 2026-11-03T17:00");
    expect(r.warnings.map((w) => w.code)).toContain("MANUAL_TASK_BEFORE_PREDECESSOR");
  });
});

describe("hierarchy", () => {
  it("rolls up summary dates and duration", () => {
    const r = schedule(
      project(
        [
          { id: "S" },
          { id: "A", parentId: "S", duration: 2 * D },
          { id: "B", parentId: "S", duration: 1 * D },
        ],
        [{ predecessorId: "A", successorId: "B" }],
      ),
    );
    const s = r.tasks["S"]!;
    expect(s.isSummary).toBe(true);
    expect(dates(r, "S")).toBe("2026-11-01T08:00 .. 2026-11-03T17:00");
    expect(s.duration).toBe(3 * D);
    expect(s.wbs).toBe("1");
    expect(r.tasks["A"]!.wbs).toBe("1.1");
    expect(r.tasks["B"]!.wbs).toBe("1.2");
    expect(r.tasks["B"]!.outlineLevel).toBe(2);
    expect(s.isCritical).toBe(true);
  });

  it("applies a summary's predecessor to all its subtasks", () => {
    const r = schedule(
      project(
        [
          { id: "P", duration: 1 * D },
          { id: "S" },
          { id: "A", parentId: "S", duration: 2 * D },
          { id: "B", parentId: "S", duration: 1 * D },
        ],
        [
          { predecessorId: "P", successorId: "S" },
          { predecessorId: "A", successorId: "B" },
        ],
      ),
    );
    expect(dates(r, "A")).toBe("2026-11-02T08:00 .. 2026-11-03T17:00");
    expect(dates(r, "B")).toBe("2026-11-04T08:00 .. 2026-11-04T17:00");
    expect(dates(r, "S")).toBe("2026-11-02T08:00 .. 2026-11-04T17:00");
    expect(r.tasks["P"]!.totalSlack).toBe(0);
  });

  it("uses a summary as predecessor", () => {
    const r = schedule(
      project(
        [
          { id: "S" },
          { id: "A", parentId: "S", duration: 2 * D },
          { id: "B", parentId: "S", duration: 1 * D },
          { id: "X", duration: 1 * D },
        ],
        [{ predecessorId: "S", successorId: "X" }],
      ),
    );
    expect(dates(r, "X")).toBe("2026-11-03T08:00 .. 2026-11-03T17:00");
    expect(r.tasks["A"]!.totalSlack).toBe(0);
    expect(r.tasks["B"]!.totalSlack).toBe(D);
  });

  it("rejects a summary depending on its own subtask", () => {
    expect(() =>
      schedule(project([{ id: "S" }, { id: "A", parentId: "S", duration: D }], [{ predecessorId: "A", successorId: "S" }])),
    ).toThrow(/Circular/);
  });
});

describe("constraints and deadlines", () => {
  it("SNET pushes a task later and creates slack upstream", () => {
    const r = schedule(
      project(
        [{ id: "A", duration: 1 * D }, { id: "B", duration: 1 * D, constraintType: "SNET", constraintDate: utc("2026-11-10") }],
        [{ predecessorId: "A", successorId: "B" }],
      ),
    );
    expect(dates(r, "B")).toBe("2026-11-10T08:00 .. 2026-11-10T17:00");
    // A finishes Sun 1 Nov; B starts Tue 10 Nov: Mon, Tue, Wed, Thu, Sun, Mon = 6 working days.
    expect(r.tasks["A"]!.totalSlack).toBe(6 * D);
    expect(r.tasks["A"]!.freeSlack).toBe(6 * D);
  });

  it("MSO forces the date and reports the conflict", () => {
    const r = schedule(
      project(
        [{ id: "A", duration: 3 * D }, { id: "B", duration: 1 * D, constraintType: "MSO", constraintDate: utc("2026-11-02") }],
        [{ predecessorId: "A", successorId: "B" }],
      ),
    );
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-02T17:00");
    expect(r.warnings.map((w) => w.code)).toContain("CONSTRAINT_CONFLICT");
    expect(r.tasks["A"]!.totalSlack).toBeLessThan(0);
    expect(r.warnings.some((w) => w.code === "NEGATIVE_SLACK" && w.taskId === "A")).toBe(true);
  });

  it("FNLT caps late dates (negative slack when violated)", () => {
    const r = schedule(
      project(
        [{ id: "A", duration: 2 * D }, { id: "B", duration: 2 * D, constraintType: "FNLT", constraintDate: utc("2026-11-03T17:00") }],
        [{ predecessorId: "A", successorId: "B" }],
      ),
    );
    expect(r.warnings.map((w) => w.code)).toContain("CONSTRAINT_CONFLICT");
    // Scheduled at the constraint (Mon 2 .. Tue 3) while dependencies want Tue 3 .. Wed 4 → one day of negative slack.
    expect(dates(r, "B")).toBe("2026-11-02T08:00 .. 2026-11-03T17:00");
    expect(fmt(r.tasks["B"]!.earlyStart)).toBe("2026-11-03T08:00");
    expect(r.tasks["B"]!.totalSlack).toBe(-D);
  });

  it("deadlines cap late finish and warn when missed", () => {
    const ok = schedule(project([{ id: "A", duration: 1 * D, deadline: utc("2026-11-05T17:00") }, { id: "B", duration: 5 * D }]));
    expect(ok.tasks["A"]!.totalSlack).toBe(4 * D);
    expect(ok.warnings).toEqual([]);

    const missed = schedule(project([{ id: "A", duration: 3 * D, deadline: utc("2026-11-02T17:00") }]));
    expect(missed.warnings.map((w) => w.code)).toEqual(expect.arrayContaining(["DEADLINE_MISSED", "NEGATIVE_SLACK"]));
    expect(missed.tasks["A"]!.totalSlack).toBe(-D);
  });

  it("ALAP schedules as late as possible without delaying successors", () => {
    const r = schedule(
      project(
        [{ id: "A", duration: 3 * D }, { id: "B", duration: 1 * D, constraintType: "ALAP" }, { id: "C", duration: 1 * D }],
        [
          { predecessorId: "A", successorId: "C" },
          { predecessorId: "B", successorId: "C" },
        ],
      ),
    );
    expect(dates(r, "B")).toBe("2026-11-03T08:00 .. 2026-11-03T17:00");
    expect(dates(r, "C")).toBe("2026-11-04T08:00 .. 2026-11-04T17:00");
    expect(fmt(r.tasks["B"]!.earlyStart)).toBe("2026-11-01T08:00");
  });

  it("requires a constraint date for date constraints", () => {
    expect(() => schedule(project([{ id: "A", duration: D, constraintType: "SNET" }]))).toThrow(/requires constraintDate/);
  });
});

describe("critical path and slack", () => {
  it("distinguishes free slack from total slack", () => {
    // E → F → G, where F has 2 days of slack from a parallel branch; E's free slack is 0 (it feeds F directly).
    const r = schedule(
      project(
        [
          { id: "E", duration: 1 * D },
          { id: "F", duration: 1 * D },
          { id: "L", duration: 4 * D },
          { id: "G", duration: 1 * D },
        ],
        [
          { predecessorId: "E", successorId: "F" },
          { predecessorId: "F", successorId: "G" },
          { predecessorId: "L", successorId: "G" },
        ],
      ),
    );
    expect(r.tasks["E"]!.totalSlack).toBe(2 * D);
    expect(r.tasks["E"]!.freeSlack).toBe(0);
    expect(r.tasks["F"]!.totalSlack).toBe(2 * D);
    expect(r.tasks["F"]!.freeSlack).toBe(2 * D);
    expect(r.criticalPath).toEqual(["L", "G"]);
  });

  it("honours the critical slack threshold", () => {
    const tasks: TaskInput[] = [{ id: "A", duration: 2 * D }, { id: "C", duration: 1 * D }, { id: "B", duration: 1 * D }];
    const deps: DependencyInput[] = [
      { predecessorId: "A", successorId: "B" },
      { predecessorId: "C", successorId: "B" },
    ];
    const strict = schedule(project(tasks, deps));
    const loose = schedule(project(tasks, deps, { options: { criticalSlackThreshold: D } }));
    expect(strict.tasks["C"]!.isCritical).toBe(false);
    expect(loose.tasks["C"]!.isCritical).toBe(true);
  });

  it("detects dependency cycles and names them", () => {
    expect(() =>
      schedule(
        project(
          [{ id: "A", duration: D }, { id: "B", duration: D }, { id: "C", duration: D }],
          [
            { predecessorId: "A", successorId: "B" },
            { predecessorId: "B", successorId: "C" },
            { predecessorId: "C", successorId: "A" },
          ],
        ),
      ),
    ).toThrow(/Circular dependency: A → B → C → A/);
  });

  it("rejects unknown task references", () => {
    expect(() => schedule(project([{ id: "A", duration: D }], [{ predecessorId: "A", successorId: "Z" }]))).toThrow(/unknown successor/);
    expect(() => schedule(project([{ id: "A", duration: D, parentId: "Z" }]))).toThrow(/unknown parent/);
    expect(() => schedule(project([{ id: "A", duration: D, calendarId: "nope" }]))).toThrow(/unknown calendar/);
  });

  it("lag can be measured in the project calendar instead of the successor's", () => {
    const tasks: TaskInput[] = [
      { id: "IL", duration: 1 * D, constraintType: "SNET", constraintDate: utc("2026-11-04") }, // Wed
      { id: "US", duration: 1 * D, calendarId: standardMonFri.id },
    ];
    const deps: DependencyInput[] = [{ predecessorId: "IL", successorId: "US", lag: 2 * D }];
    const bySuccessor = schedule(project(tasks, deps));
    const byProject = schedule(project(tasks, deps, { options: { lagCalendar: "project" }, calendarId: israelStandard.id }));
    // Successor (Mon–Fri) calendar: Wed 17:00 + 2 working days (Thu, Fri) → starts Mon 9 Nov.
    expect(fmt(bySuccessor.tasks["US"]!.start)).toBe("2026-11-09T08:00");
    // Project (Sun–Thu) calendar: Wed 17:00 + 2 working days (Thu, Sun) → earliest Mon 9 Nov as well in this case,
    // but measured differently: Thu 17:00 → Sun 17:00, snapped to US Monday.
    expect(fmt(byProject.tasks["US"]!.start)).toBe("2026-11-09T08:00");
  });
});

describe("scale", () => {
  it("schedules a 10,000-task chain quickly", () => {
    const tasks: TaskInput[] = [];
    const deps: DependencyInput[] = [];
    for (let i = 0; i < 10_000; i++) {
      tasks.push({ id: `T${i}`, duration: 60 });
      if (i > 0) deps.push({ predecessorId: `T${i - 1}`, successorId: `T${i}` });
    }
    const t0 = performance.now();
    const r = schedule(project(tasks, deps));
    const ms = performance.now() - t0;
    expect(r.criticalPath.length).toBe(10_000);
    expect(ms).toBeLessThan(5_000);
  });
});
