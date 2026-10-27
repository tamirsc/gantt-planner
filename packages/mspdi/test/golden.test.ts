import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { fmt, schedule } from "@gantt-planner/engine";
import { readMspdi } from "../src/reader.js";
import { writeMspdi } from "../src/writer.js";

const dir = join(__dirname, "..", "fixtures", "golden");
const files = readdirSync(dir).filter((f) => f.endsWith(".xml")).sort();

describe.each(files)("golden %s", (file) => {
  const xml = readFileSync(join(dir, file), "utf8");
  const doc = readMspdi(xml);
  const result = schedule(doc.project);

  it("reproduces the stored start and finish of every task", () => {
    const mismatches: string[] = [];
    for (const [id, stored] of Object.entries(doc.stored)) {
      const t = result.tasks[id]!;
      if (stored.start !== undefined && t.start !== stored.start) {
        mismatches.push(`${stored.name}: start ${fmt(t.start)} ≠ stored ${fmt(stored.start)}`);
      }
      if (stored.finish !== undefined && t.finish !== stored.finish) {
        mismatches.push(`${stored.name}: finish ${fmt(t.finish)} ≠ stored ${fmt(stored.finish)}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("reproduces the stored slack and critical flags", () => {
    const mismatches: string[] = [];
    for (const [id, stored] of Object.entries(doc.stored)) {
      const t = result.tasks[id]!;
      if (stored.totalSlack !== undefined && t.totalSlack !== stored.totalSlack) {
        mismatches.push(`${stored.name}: total slack ${t.totalSlack} ≠ stored ${stored.totalSlack}`);
      }
      if (stored.freeSlack !== undefined && t.freeSlack !== stored.freeSlack) {
        mismatches.push(`${stored.name}: free slack ${t.freeSlack} ≠ stored ${stored.freeSlack}`);
      }
      if (stored.critical !== undefined && t.isCritical !== stored.critical) {
        mismatches.push(`${stored.name}: critical ${t.isCritical} ≠ stored ${stored.critical}`);
      }
    }
    expect(mismatches).toEqual([]);
  });

  it("reproduces the stored project finish and outline", () => {
    if (doc.storedFinish !== undefined) expect(fmt(result.projectFinish)).toBe(fmt(doc.storedFinish));
    for (const [id, stored] of Object.entries(doc.stored)) {
      const t = result.tasks[id]!;
      expect(t.outlineLevel).toBe(stored.outlineLevel);
      if (stored.outlineNumber !== undefined) expect(t.wbs).toBe(stored.outlineNumber);
      if (stored.summary !== undefined) expect(t.isSummary).toBe(stored.summary);
    }
  });

  it("survives a write → read round trip", () => {
    const xml2 = writeMspdi(doc.project, { name: doc.name, result });
    const doc2 = readMspdi(xml2);
    const result2 = schedule(doc2.project);
    expect(result2.order).toEqual(result.order);
    for (const id of result.order) {
      const a = result.tasks[id]!;
      const b = result2.tasks[id]!;
      expect([b.name, fmt(b.start), fmt(b.finish), b.totalSlack, b.isCritical, b.wbs]).toEqual([
        a.name,
        fmt(a.start),
        fmt(a.finish),
        a.totalSlack,
        a.isCritical,
        a.wbs,
      ]);
    }
    expect(doc2.warnings).toEqual([]);
  });
});
