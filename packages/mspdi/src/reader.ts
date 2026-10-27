import { XMLParser } from "fast-xml-parser";
import {
  type AssignmentInput,
  type BaselineInput,
  type CalendarDefinition,
  type CalendarException,
  type DependencyInput,
  type ProjectInput,
  type ResourceInput,
  type TaskInput,
  type TimeInterval,
} from "@gantt-planner/engine";
import {
  CONSTRAINT_FROM_CODE,
  LINK_TYPE_FROM_CODE,
  RATE_FORMAT_HOURLY,
  RESOURCE_TYPE_FROM_CODE,
  TASK_TYPE_FROM_CODE,
  UNASSIGNED_RESOURCE_UID,
  isElapsedFormat,
  isPercentFormat,
} from "./codes.js";
import { asArray, parseClockTime, parseDateTime, parseTimeSpan, toBool, toInt, toNumber } from "./xmlvalue.js";

/** Values MS Project stored in the file; used to compare our schedule against MS Project's. */
export interface StoredTaskValues {
  uid: number;
  name: string;
  outlineLevel: number;
  outlineNumber?: string;
  wbs?: string;
  start?: number;
  finish?: number;
  earlyStart?: number;
  earlyFinish?: number;
  lateStart?: number;
  lateFinish?: number;
  /** Working minutes (file stores tenths of a minute). */
  totalSlack?: number;
  freeSlack?: number;
  critical?: boolean;
  summary?: boolean;
  milestone?: boolean;
  durationMinutes?: number;
  durationFormat?: number;
  percentComplete?: number;
  /** Minutes. */
  work?: number;
  cost?: number;
}

export interface MspdiReadWarning {
  code: "ELAPSED_DURATION" | "PERCENT_LAG" | "UNSUPPORTED_EXCEPTION" | "DERIVED_CALENDAR" | "SKIPPED_TASK" | "RATE_FORMAT" | "SKIPPED_ASSIGNMENT";
  message: string;
  taskUid?: number;
}

export interface MspdiDocument {
  /** Engine input reconstructed from the file. Task ids are the MSPDI UIDs as strings. */
  project: ProjectInput;
  name: string;
  /** Project finish date stored in the file, if any. */
  storedFinish?: number;
  minutesPerDay: number;
  stored: Record<string, StoredTaskValues>;
  warnings: MspdiReadWarning[];
}

const parser = new XMLParser({
  ignoreAttributes: true,
  removeNSPrefix: true,
  parseTagValue: false,
  trimValues: true,
  isArray: (name) =>
    ["Calendar", "WeekDay", "WorkingTime", "Exception", "WorkWeek", "Task", "PredecessorLink", "ExtendedAttribute", "Resource", "Assignment", "Baseline"].includes(
      name,
    ),
});

/** Parse an MSPDI XML document into engine input plus the values MS Project stored. */
export function readMspdi(xml: string): MspdiDocument {
  const doc = parser.parse(xml) as Record<string, unknown>;
  const root = doc["Project"] as Record<string, unknown> | undefined;
  if (!root) throw new Error("Not an MSPDI document: missing <Project> root element");

  const warnings: MspdiReadWarning[] = [];
  const minutesPerDay = toInt(root["MinutesPerDay"]) ?? 480;
  const projectStart = parseDateTime(root["StartDate"]);
  if (projectStart === undefined) throw new Error("MSPDI document has no <StartDate>");
  const projectCalendarUid = toInt(root["CalendarUID"]);

  // ---- calendars ----------------------------------------------------------
  const rawCalendars = asArray((root["Calendars"] as Record<string, unknown> | undefined)?.["Calendar"]) as Record<
    string,
    unknown
  >[];
  const calendars = readCalendars(rawCalendars, minutesPerDay, warnings);

  // ---- tasks --------------------------------------------------------------
  const rawTasks = asArray((root["Tasks"] as Record<string, unknown> | undefined)?.["Task"]) as Record<string, unknown>[];
  const tasks: TaskInput[] = [];
  const dependencies: DependencyInput[] = [];
  const stored: Record<string, StoredTaskValues> = {};
  const durations = new Map<string, number>();
  const baselines = new Map<number, BaselineInput>();
  // Outline stack: parent at each level.
  const stack: string[] = [];

  for (const raw of rawTasks) {
    const uid = toInt(raw["UID"]);
    if (uid === undefined) continue;
    if (toBool(raw["IsNull"])) continue;
    const outlineLevel = toInt(raw["OutlineLevel"]) ?? 1;
    // UID 0 / outline level 0 is the project summary task; it is not a real task.
    if (uid === 0 || outlineLevel === 0) continue;
    if (toBool(raw["ExternalTask"])) {
      warnings.push({ code: "SKIPPED_TASK", taskUid: uid, message: `External task ${uid} skipped.` });
      continue;
    }

    const id = String(uid);
    const name = String(raw["Name"] ?? id);
    const durationFormat = toInt(raw["DurationFormat"]);
    let durationMinutes = parseTimeSpan(raw["Duration"]) ?? 0;
    if (isElapsedFormat(durationFormat) && durationMinutes > 0) {
      warnings.push({
        code: "ELAPSED_DURATION",
        taskUid: uid,
        message: `Task ${uid} uses an elapsed duration; treated as working time.`,
      });
    }
    const isSummary = toBool(raw["Summary"]) ?? false;
    const manual = toBool(raw["Manual"]) ?? false;
    const start = parseDateTime(raw["Start"]);
    const finish = parseDateTime(raw["Finish"]);
    const manualStart = parseDateTime(raw["ManualStart"]) ?? start;
    const manualFinish = parseDateTime(raw["ManualFinish"]) ?? finish;

    stack.length = outlineLevel - 1;
    const parentId = stack[outlineLevel - 2];
    stack[outlineLevel - 1] = id;

    const task: TaskInput = { id, name };
    if (parentId !== undefined) task.parentId = parentId;
    if (!isSummary) {
      task.duration = durationMinutes;
      if (toBool(raw["Milestone"])) task.isMilestone = true;
      if (manual && manualStart !== undefined) {
        task.schedulingMode = "manual";
        task.start = manualStart;
        if (manualFinish !== undefined && durationMinutes === 0) task.finish = manualFinish;
      }
    }
    const constraintCode = toInt(raw["ConstraintType"]);
    if (constraintCode !== undefined && constraintCode !== 0) {
      const ct = CONSTRAINT_FROM_CODE[constraintCode];
      const cd = parseDateTime(raw["ConstraintDate"]);
      if (ct && (ct === "ALAP" || cd !== undefined)) {
        task.constraintType = ct;
        if (cd !== undefined) task.constraintDate = cd;
      }
    }
    const deadline = parseDateTime(raw["Deadline"]);
    if (deadline !== undefined) task.deadline = deadline;
    const calUid = toInt(raw["CalendarUID"]);
    if (calUid !== undefined && calUid !== -1 && calendars.some((c) => c.id === String(calUid))) {
      task.calendarId = String(calUid);
    }
    const pct = toInt(raw["PercentComplete"]);
    if (pct !== undefined) task.percentComplete = pct;
    const taskType = TASK_TYPE_FROM_CODE[toInt(raw["Type"]) ?? -1];
    if (taskType && taskType !== "fixedUnits") task.taskType = taskType;
    if (toBool(raw["EffortDriven"])) task.effortDriven = true;
    const fixedCost = toNumber(raw["FixedCost"]);
    if (fixedCost) task.fixedCost = fixedCost;
    tasks.push(task);
    durations.set(id, durationMinutes);

    for (const bl of asArray(raw["Baseline"]) as Record<string, unknown>[]) {
      const number = toInt(bl["Number"]);
      const bStart = parseDateTime(bl["Start"]);
      const bFinish = parseDateTime(bl["Finish"]);
      if (number === undefined || bStart === undefined || bFinish === undefined) continue;
      let entry = baselines.get(number);
      if (!entry) baselines.set(number, (entry = { index: number, takenAt: projectStart, tasks: {} }));
      entry.tasks[id] = {
        start: bStart,
        finish: bFinish,
        duration: parseTimeSpan(bl["Duration"]) ?? 0,
        work: parseTimeSpan(bl["Work"]) ?? 0,
        cost: toNumber(bl["Cost"]) ?? 0,
      };
    }

    for (const link of asArray(raw["PredecessorLink"]) as Record<string, unknown>[]) {
      const predUid = toInt(link["PredecessorUID"]);
      if (predUid === undefined) continue;
      if (toBool(link["CrossProject"])) continue;
      const type = LINK_TYPE_FROM_CODE[toInt(link["Type"]) ?? 1] ?? "FS";
      const lagFormat = toInt(link["LagFormat"]);
      const rawLag = toInt(link["LinkLag"]) ?? 0;
      let lag = rawLag / 10;
      if (isPercentFormat(lagFormat)) {
        // Percent lag is a percentage of the predecessor's duration; MS Project stores
        // it in tenths of a percent. Resolved below once all durations are known.
        lag = Number.NaN;
        warnings.push({
          code: "PERCENT_LAG",
          taskUid: uid,
          message: `Task ${uid}: lag on predecessor ${predUid} is a percentage; converted using the predecessor duration.`,
        });
      }
      const dep: DependencyInput = { predecessorId: String(predUid), successorId: id, type, lag };
      if (Number.isNaN(lag)) (dep as DependencyInput & { percentLag: number }).percentLag = rawLag / 10;
      dependencies.push(dep);
    }

    const storedValues: StoredTaskValues = { uid, name, outlineLevel };
    const on = raw["OutlineNumber"];
    if (on !== undefined) storedValues.outlineNumber = String(on);
    const wbs = raw["WBS"];
    if (wbs !== undefined) storedValues.wbs = String(wbs);
    if (start !== undefined) storedValues.start = start;
    if (finish !== undefined) storedValues.finish = finish;
    const es = parseDateTime(raw["EarlyStart"]);
    if (es !== undefined) storedValues.earlyStart = es;
    const ef = parseDateTime(raw["EarlyFinish"]);
    if (ef !== undefined) storedValues.earlyFinish = ef;
    const ls = parseDateTime(raw["LateStart"]);
    if (ls !== undefined) storedValues.lateStart = ls;
    const lf = parseDateTime(raw["LateFinish"]);
    if (lf !== undefined) storedValues.lateFinish = lf;
    const ts = toInt(raw["TotalSlack"]);
    if (ts !== undefined) storedValues.totalSlack = ts / 10;
    const fs = toInt(raw["FreeSlack"]);
    if (fs !== undefined) storedValues.freeSlack = fs / 10;
    const crit = toBool(raw["Critical"]);
    if (crit !== undefined) storedValues.critical = crit;
    storedValues.summary = isSummary;
    const ms = toBool(raw["Milestone"]);
    if (ms !== undefined) storedValues.milestone = ms;
    storedValues.durationMinutes = durationMinutes;
    if (durationFormat !== undefined) storedValues.durationFormat = durationFormat;
    const storedWork = parseTimeSpan(raw["Work"]);
    if (storedWork !== undefined) storedValues.work = storedWork;
    const storedCost = toNumber(raw["Cost"]);
    if (storedCost !== undefined) storedValues.cost = storedCost;
    if (pct !== undefined) storedValues.percentComplete = pct;
    stored[id] = storedValues;
  }

  // Resolve percent lags now that predecessor durations are known.
  for (const dep of dependencies) {
    const pctLag = (dep as DependencyInput & { percentLag?: number }).percentLag;
    if (pctLag !== undefined) {
      const predDuration = durations.get(dep.predecessorId) ?? 0;
      dep.lag = Math.round((predDuration * pctLag) / 100);
      delete (dep as DependencyInput & { percentLag?: number }).percentLag;
    }
  }

  // ---- resources ----------------------------------------------------------
  const resources: ResourceInput[] = [];
  for (const raw of asArray((root["Resources"] as Record<string, unknown> | undefined)?.["Resource"]) as Record<string, unknown>[]) {
    const uid = toInt(raw["UID"]);
    if (uid === undefined || uid === 0 || toBool(raw["IsNull"])) continue; // UID 0 is the "Unassigned" placeholder
    const r: ResourceInput = { id: String(uid), name: String(raw["Name"] ?? `Resource ${uid}`) };
    const type = RESOURCE_TYPE_FROM_CODE[toInt(raw["Type"]) ?? 1] ?? "work";
    if (type !== "work") r.type = type;
    const maxUnits = toNumber(raw["MaxUnits"]);
    if (maxUnits !== undefined && maxUnits !== 1) r.maxUnits = maxUnits;
    const calUid = toInt(raw["CalendarUID"]);
    if (calUid !== undefined && calUid !== -1 && calendars.some((c) => c.id === String(calUid))) r.calendarId = String(calUid);
    const rate = toNumber(raw["StandardRate"]);
    if (rate) {
      const format = toInt(raw["StandardRateFormat"]) ?? RATE_FORMAT_HOURLY;
      // Convert daily/weekly rates to hourly using the project's day length; other formats are kept as given and flagged.
      if (format === 3) r.standardRate = rate / (minutesPerDay / 60);
      else if (format === 4) r.standardRate = rate / ((minutesPerDay / 60) * 5);
      else {
        r.standardRate = rate;
        if (format !== RATE_FORMAT_HOURLY && type === "work") {
          warnings.push({ code: "RATE_FORMAT", message: `Resource ${uid}: standard rate format ${format} treated as hourly.` });
        }
      }
    }
    const perUse = toNumber(raw["CostPerUse"]);
    if (perUse) r.costPerUse = perUse;
    resources.push(r);
  }
  const resourceIds = new Set(resources.map((r) => r.id));

  // ---- assignments --------------------------------------------------------
  const assignments: AssignmentInput[] = [];
  for (const raw of asArray((root["Assignments"] as Record<string, unknown> | undefined)?.["Assignment"]) as Record<string, unknown>[]) {
    const taskUid = toInt(raw["TaskUID"]);
    const resourceUid = toInt(raw["ResourceUID"]);
    if (taskUid === undefined || resourceUid === undefined || resourceUid === UNASSIGNED_RESOURCE_UID) continue;
    if (!durations.has(String(taskUid)) || !resourceIds.has(String(resourceUid))) {
      warnings.push({ code: "SKIPPED_ASSIGNMENT", taskUid, message: `Assignment of resource ${resourceUid} to task ${taskUid} refers to an unknown task or resource.` });
      continue;
    }
    const a: AssignmentInput = { taskId: String(taskUid), resourceId: String(resourceUid) };
    const units = toNumber(raw["Units"]);
    if (units !== undefined && units !== 1) a.units = units;
    const work = parseTimeSpan(raw["Work"]);
    if (work !== undefined) a.work = work;
    const resource = resources.find((r) => r.id === a.resourceId)!;
    if (resource.type === "cost") {
      const cost = toNumber(raw["Cost"]);
      if (cost !== undefined) a.cost = cost;
    }
    assignments.push(a);
  }

  const projectCalendarId =
    projectCalendarUid !== undefined && calendars.some((c) => c.id === String(projectCalendarUid))
      ? String(projectCalendarUid)
      : calendars[0]?.id;

  const project: ProjectInput = { start: projectStart, tasks, dependencies };
  if (calendars.length > 0) project.calendars = calendars;
  if (resources.length > 0) project.resources = resources;
  if (assignments.length > 0) project.assignments = assignments;
  if (baselines.size > 0) project.baselines = [...baselines.values()].sort((a, b) => a.index - b.index);
  if (projectCalendarId !== undefined) project.calendarId = projectCalendarId;
  const criticalSlackLimitDays = toInt(root["CriticalSlackLimit"]);
  if (criticalSlackLimitDays !== undefined && criticalSlackLimitDays > 0) {
    project.options = { criticalSlackThreshold: criticalSlackLimitDays * minutesPerDay };
  }

  const result: MspdiDocument = {
    project,
    name: String(root["Name"] ?? root["Title"] ?? ""),
    minutesPerDay,
    stored,
    warnings,
  };
  const storedFinish = parseDateTime(root["FinishDate"]);
  if (storedFinish !== undefined) result.storedFinish = storedFinish;
  return result;
}

// ---------------------------------------------------------------------------

function readCalendars(
  rawCalendars: Record<string, unknown>[],
  minutesPerDay: number,
  warnings: MspdiReadWarning[],
): CalendarDefinition[] {
  type Partial = {
    uid: number;
    name: string;
    baseUid: number | undefined;
    weekDays: (TimeInterval[] | undefined)[];
    exceptions: CalendarException[];
  };
  const partials = new Map<number, Partial>();

  for (const raw of rawCalendars) {
    const uid = toInt(raw["UID"]);
    if (uid === undefined) continue;
    const name = String(raw["Name"] ?? `Calendar ${uid}`);
    const baseUid = toInt(raw["BaseCalendarUID"]);
    const weekDays: (TimeInterval[] | undefined)[] = [undefined, undefined, undefined, undefined, undefined, undefined, undefined];
    const exceptions: CalendarException[] = [];

    for (const wd of asArray((raw["WeekDays"] as Record<string, unknown> | undefined)?.["WeekDay"]) as Record<string, unknown>[]) {
      const dayType = toInt(wd["DayType"]);
      const working = toBool(wd["DayWorking"]) ?? false;
      const intervals = working ? readWorkingTimes(wd["WorkingTimes"]) : [];
      if (dayType === 0) {
        // Legacy exception form (pre-2007 and still emitted by MS Project for compatibility).
        const tp = wd["TimePeriod"] as Record<string, unknown> | undefined;
        const from = parseDateTime(tp?.["FromDate"]);
        const to = parseDateTime(tp?.["ToDate"]);
        if (from !== undefined) {
          exceptions.push({ from: isoDate(from), to: isoDate(to ?? from), intervals, name: "Exception" });
        }
      } else if (dayType !== undefined && dayType >= 1 && dayType <= 7) {
        weekDays[dayType - 1] = intervals;
      }
    }
    for (const ex of asArray((raw["Exceptions"] as Record<string, unknown> | undefined)?.["Exception"]) as Record<string, unknown>[]) {
      const tp = ex["TimePeriod"] as Record<string, unknown> | undefined;
      const from = parseDateTime(tp?.["FromDate"]);
      const to = parseDateTime(tp?.["ToDate"]);
      if (from === undefined) continue;
      const type = toInt(ex["Type"]);
      if (type !== undefined && type !== 1 && type !== 9) {
        warnings.push({
          code: "UNSUPPORTED_EXCEPTION",
          message: `Calendar ${uid}: recurring exception "${String(ex["Name"] ?? "")}" (type ${type}) applied only to its first period.`,
        });
      }
      const working = toBool(ex["DayWorking"]) ?? false;
      const item: CalendarException = {
        from: isoDate(from),
        to: isoDate(to ?? from),
        intervals: working ? readWorkingTimes(ex["WorkingTimes"]) : [],
      };
      const exName = ex["Name"];
      if (exName !== undefined) item.name = String(exName);
      exceptions.push(item);
    }
    // Legacy exceptions above and new-style exceptions may duplicate each other; keep both,
    // later entries win in the engine which yields the same result.
    partials.set(uid, { uid, name, baseUid, weekDays, exceptions });
  }

  const resolved = new Map<number, CalendarDefinition>();
  const resolve = (uid: number, chain: number[] = []): CalendarDefinition | undefined => {
    const cached = resolved.get(uid);
    if (cached) return cached;
    const p = partials.get(uid);
    if (!p || chain.includes(uid)) return undefined;
    let base: CalendarDefinition | undefined;
    if (p.baseUid !== undefined && p.baseUid !== -1 && p.baseUid !== uid) {
      base = resolve(p.baseUid, [...chain, uid]);
      if (!base) warnings.push({ code: "DERIVED_CALENDAR", message: `Calendar ${uid}: base calendar ${p.baseUid} not found.` });
    }
    const weekDays = p.weekDays.map((d, i) => d ?? base?.weekDays[i as 0] ?? []) as CalendarDefinition["weekDays"];
    const exceptions = [...(base?.exceptions ?? []), ...p.exceptions];
    const def: CalendarDefinition = { id: String(uid), name: p.name, weekDays, minutesPerDay };
    if (exceptions.length > 0) def.exceptions = exceptions;
    if (!weekDays.some((d) => d.length > 0)) {
      // No working time at all (e.g. an empty derived calendar) – fall back to Mon–Fri so scheduling can proceed.
      const std: TimeInterval[] = [
        { from: 8 * 60, to: 12 * 60 },
        { from: 13 * 60, to: 17 * 60 },
      ];
      def.weekDays = [[], std, std, std, std, std, []];
    }
    resolved.set(uid, def);
    return def;
  };
  const out: CalendarDefinition[] = [];
  for (const uid of partials.keys()) {
    const def = resolve(uid);
    if (def) out.push(def);
  }
  return out;
}

function readWorkingTimes(node: unknown): TimeInterval[] {
  const times = asArray((node as Record<string, unknown> | undefined)?.["WorkingTime"]) as Record<string, unknown>[];
  const out: TimeInterval[] = [];
  for (const wt of times) {
    if (wt["FromTime"] === undefined || wt["ToTime"] === undefined) continue;
    const from = parseClockTime(wt["FromTime"]);
    const to = parseClockTime(wt["ToTime"], true);
    if (to > from) out.push({ from, to });
  }
  return out;
}

function isoDate(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}
