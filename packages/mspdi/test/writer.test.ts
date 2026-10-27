import { describe, expect, it } from "vitest";
import { fmt, schedule, standardMonFri, utc, type ProjectInput } from "@gantt-planner/engine";
import { readMspdi } from "../src/reader.js";
import { writeMspdi } from "../src/writer.js";
import { formatTimeSpan, parseTimeSpan } from "../src/xmlvalue.js";

const D = 480;

const project: ProjectInput = {
  start: utc("2026-11-01"),
  tasks: [
    { id: "phase", name: "שלב א' <Design & Build>" },
    { id: "design", name: "אפיון", parentId: "phase", duration: 2 * D },
    { id: "build", name: "Build", parentId: "phase", duration: 3 * D },
    { id: "review", name: "US review", duration: 1 * D, calendarId: standardMonFri.id },
    { id: "ship", name: "Ship", deadline: utc("2026-11-12T17:00") },
    { id: "fixed", name: "Fixed meeting", duration: 2 * 60, schedulingMode: "manual", start: utc("2026-11-03T13:00") },
  ],
  dependencies: [
    { predecessorId: "design", successorId: "build" },
    { predecessorId: "build", successorId: "review", lag: D },
    { predecessorId: "review", successorId: "ship" },
    { predecessorId: "design", successorId: "review", type: "SS", lag: -60 },
  ],
};

describe("writeMspdi", () => {
  const xml = writeMspdi(project, { name: "Demo" });

  it("produces a namespaced, well-formed document with escaped names", () => {
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')).toBe(true);
    expect(xml).toContain('<Project xmlns="http://schemas.microsoft.com/project">');
    expect(xml).toContain("<Name>שלב א&apos; &lt;Design &amp; Build&gt;</Name>".replace("&apos;", "'"));
    expect(xml).toContain("<LinkLag>4800</LinkLag>");
    expect(xml).toContain("<LinkLag>-600</LinkLag>");
    expect(xml).toContain("<Type>3</Type>"); // SS link
    expect(xml).toContain("<Manual>1</Manual>");
    expect(xml).toContain("<Deadline>2026-11-12T17:00:00</Deadline>");
  });

  it("writes calendars with the project calendar as UID 1 and task calendars referenced", () => {
    expect(xml).toContain("<CalendarUID>1</CalendarUID>");
    expect(xml).toContain("<Name>Israel Standard (Sun–Thu)</Name>");
    expect(xml).toContain("<Name>Standard (Mon–Fri)</Name>");
    expect(xml).toContain("<CalendarUID>2</CalendarUID>");
  });

  it("round-trips through the reader with identical schedule", () => {
    const original = schedule(project);
    const doc = readMspdi(xml);
    expect(doc.name).toBe("Demo");
    expect(doc.warnings).toEqual([]);
    const again = schedule(doc.project);
    expect(fmt(again.projectFinish)).toBe(fmt(original.projectFinish));
    // Ids become sequential UIDs; compare in outline order by name.
    const byName = (r: typeof original) => Object.values(r.tasks).map((t) => [t.name, fmt(t.start), fmt(t.finish), t.totalSlack, t.wbs]);
    expect(byName(again).sort()).toEqual(byName(original).sort());
    const fixed = Object.values(again.tasks).find((t) => t.name === "Fixed meeting")!;
    expect(fixed.schedulingMode).toBe("manual");
    expect(fmt(fixed.start)).toBe("2026-11-03T13:00");
  });

  it("keeps numeric ids as UIDs", () => {
    const p: ProjectInput = { start: utc("2026-11-01"), tasks: [{ id: "7", duration: D }, { id: "12", duration: D }], dependencies: [{ predecessorId: "7", successorId: "12" }] };
    const doc = readMspdi(writeMspdi(p));
    expect(doc.project.tasks.map((t) => t.id)).toEqual(["7", "12"]);
    expect(doc.project.dependencies).toEqual([{ predecessorId: "7", successorId: "12", type: "FS", lag: 0 }]);
  });
});

describe("time spans", () => {
  it("parses and formats MSPDI durations", () => {
    expect(parseTimeSpan("PT16H0M0S")).toBe(960);
    expect(parseTimeSpan("PT0H30M0S")).toBe(30);
    expect(parseTimeSpan("PT1H15M30S")).toBe(75.5);
    expect(parseTimeSpan("P1DT2H0M0S")).toBe(26 * 60);
    expect(formatTimeSpan(960)).toBe("PT16H0M0S");
    expect(formatTimeSpan(75.5)).toBe("PT1H15M30S");
  });
});
