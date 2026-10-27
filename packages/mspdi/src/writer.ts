import {
  WorkCalendar,
  israelStandard,
  presetCalendars,
  schedule,
  type CalendarDefinition,
  type ProjectInput,
  type ScheduleResult,
  type ScheduledTask,
} from "@gantt-planner/engine";
import { CONSTRAINT_TO_CODE, DurationFormat, LINK_TYPE_TO_CODE, MSPDI_NAMESPACE } from "./codes.js";
import { escapeXml, formatClockTime, formatDateTime, formatTimeSpan } from "./xmlvalue.js";

export interface WriteOptions {
  /** Project name written to <Name> and <Title>. */
  name?: string;
  /** Precomputed schedule; computed with the engine when omitted. */
  result?: ScheduleResult;
  /** SaveVersion to declare (14 = Project 2010 and later readers). */
  saveVersion?: number;
}

/**
 * Serialize a project (and its computed schedule) as an MSPDI XML document that
 * Microsoft Project opens directly via File → Open.
 */
export function writeMspdi(project: ProjectInput, options: WriteOptions = {}): string {
  const result = options.result ?? schedule(project);
  const name = options.name ?? "Project";

  // Calendars: project calendar first (UID 1), then the others in use.
  const defs = new Map<string, CalendarDefinition>();
  for (const d of presetCalendars) defs.set(d.id, d);
  for (const d of project.calendars ?? []) defs.set(d.id, d);
  const projectCalId = project.calendarId ?? project.calendars?.[0]?.id ?? israelStandard.id;
  const usedIds = new Set<string>([projectCalId]);
  for (const t of Object.values(result.tasks)) usedIds.add(t.calendarId);
  const calendarUid = new Map<string, number>();
  const orderedCalIds = [projectCalId, ...[...usedIds].filter((id) => id !== projectCalId).sort()];
  orderedCalIds.forEach((id, i) => calendarUid.set(id, i + 1));
  const projectCal = new WorkCalendar(defs.get(projectCalId)!);
  const minutesPerDay = projectCal.minutesPerDay;
  const workingDaysPerWeek = defs.get(projectCalId)!.weekDays.filter((d) => d.length > 0).length || 5;

  // Tasks in outline order (depth-first, input order within each parent).
  const byParent = new Map<string | null, string[]>();
  for (const t of project.tasks) {
    const key = t.parentId ?? null;
    const list = byParent.get(key) ?? [];
    list.push(t.id);
    byParent.set(key, list);
  }
  const outline: ScheduledTask[] = [];
  const visit = (parent: string | null) => {
    for (const id of byParent.get(parent) ?? []) {
      const st = result.tasks[id];
      if (!st) continue;
      outline.push(st);
      visit(id);
    }
  };
  visit(null);

  // UIDs: keep positive integer ids when every id is one, otherwise number sequentially.
  const allNumeric = outline.every((t) => /^[1-9]\d*$/.test(t.id));
  const uidOf = new Map<string, number>();
  outline.forEach((t, i) => uidOf.set(t.id, allNumeric ? Number(t.id) : i + 1));

  const predsOf = new Map<string, NonNullable<ProjectInput["dependencies"]>>();
  for (const d of project.dependencies ?? []) {
    const list = predsOf.get(d.successorId) ?? [];
    list.push(d);
    predsOf.set(d.successorId, list);
  }
  const inputById = new Map(project.tasks.map((t) => [t.id, t] as const));

  const x: string[] = [];
  const el = (tag: string, value: string | number | undefined) => {
    if (value === undefined) return;
    x.push(`<${tag}>${typeof value === "number" ? String(value) : escapeXml(value)}</${tag}>`);
  };
  const bool = (tag: string, v: boolean) => el(tag, v ? 1 : 0);
  const date = (tag: string, ms: number | undefined) => {
    if (ms !== undefined && Number.isFinite(ms)) el(tag, formatDateTime(ms));
  };

  x.push(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`);
  x.push(`<Project xmlns="${MSPDI_NAMESPACE}">`);
  el("SaveVersion", options.saveVersion ?? 14);
  el("Name", name);
  el("Title", name);
  el("ScheduleFromStart", 1);
  date("StartDate", result.projectStart);
  date("FinishDate", result.projectFinish);
  el("FYStartDate", 1);
  el("CriticalSlackLimit", Math.round((project.options?.criticalSlackThreshold ?? 0) / minutesPerDay));
  el("CurrencyDigits", 2);
  el("CurrencySymbol", "$");
  el("CurrencyCode", "USD");
  el("CurrencySymbolPosition", 0);
  el("CalendarUID", 1);
  el("DefaultStartTime", formatClockTime(firstStart(defs.get(projectCalId)!)));
  el("DefaultFinishTime", formatClockTime(lastEnd(defs.get(projectCalId)!)));
  el("MinutesPerDay", minutesPerDay);
  el("MinutesPerWeek", minutesPerDay * workingDaysPerWeek);
  el("DaysPerMonth", 20);
  el("DefaultTaskType", 1);
  el("DefaultFixedCostAccrual", 3);
  el("DefaultStandardRate", 0);
  el("DefaultOvertimeRate", 0);
  el("DurationFormat", DurationFormat.days);
  el("WorkFormat", 2);
  el("EditableActualCosts", 0);
  el("HonorConstraints", 1);
  el("InsertedProjectsLikeSummary", 0);
  el("MultipleCriticalPaths", 0);
  el("NewTasksEffortDriven", 0);
  el("NewTasksEstimated", 1);
  el("SplitsInProgressTasks", 1);
  el("SpreadActualCost", 0);
  el("SpreadPercentComplete", 0);
  el("TaskUpdatesResource", 1);
  el("FiscalYearStart", 0);
  el("WeekStartDay", 1);
  el("MoveCompletedEndsBack", 0);
  el("MoveRemainingStartsBack", 0);
  el("MoveRemainingStartsForward", 0);
  el("MoveCompletedEndsForward", 0);
  el("BaselineForEarnedValue", 0);
  el("AutoAddNewResourcesAndTasks", 1);
  date("CurrentDate", result.projectStart);
  el("MicrosoftProjectServerURL", 1);
  el("Autolink", 0);
  el("NewTaskStartDate", 0);
  el("DefaultTaskEVMethod", 0);
  el("ProjectExternallyEdited", 0);
  el("ActualsInSync", 1);
  el("RemoveFileProperties", 0);
  el("AdminProject", 0);

  // ---- calendars ----------------------------------------------------------
  x.push("<Calendars>");
  for (const id of orderedCalIds) {
    const def = defs.get(id);
    if (!def) throw new Error(`Unknown calendar "${id}"`);
    x.push("<Calendar>");
    el("UID", calendarUid.get(id)!);
    el("Name", def.name ?? def.id);
    el("IsBaseCalendar", 1);
    el("BaseCalendarUID", -1);
    x.push("<WeekDays>");
    def.weekDays.forEach((intervals, i) => {
      x.push("<WeekDay>");
      el("DayType", i + 1);
      bool("DayWorking", intervals.length > 0);
      if (intervals.length > 0) {
        x.push("<WorkingTimes>");
        for (const iv of intervals) {
          x.push("<WorkingTime>");
          el("FromTime", formatClockTime(iv.from));
          el("ToTime", formatClockTime(iv.to));
          x.push("</WorkingTime>");
        }
        x.push("</WorkingTimes>");
      }
      x.push("</WeekDay>");
    });
    x.push("</WeekDays>");
    if (def.exceptions && def.exceptions.length > 0) {
      x.push("<Exceptions>");
      for (const ex of def.exceptions) {
        const from = Date.parse(`${ex.from}T00:00:00Z`);
        const to = Date.parse(`${ex.to ?? ex.from}T00:00:00Z`);
        const days = Math.round((to - from) / 86_400_000) + 1;
        x.push("<Exception>");
        el("EnteredByOccurrences", 0);
        x.push("<TimePeriod>");
        el("FromDate", `${ex.from}T00:00:00`);
        el("ToDate", `${ex.to ?? ex.from}T23:59:00`);
        x.push("</TimePeriod>");
        el("Occurrences", days);
        el("Name", ex.name ?? "Exception");
        el("Type", 1);
        bool("DayWorking", ex.intervals.length > 0);
        if (ex.intervals.length > 0) {
          x.push("<WorkingTimes>");
          for (const iv of ex.intervals) {
            x.push("<WorkingTime>");
            el("FromTime", formatClockTime(iv.from));
            el("ToTime", formatClockTime(iv.to));
            x.push("</WorkingTime>");
          }
          x.push("</WorkingTimes>");
        }
        x.push("</Exception>");
      }
      x.push("</Exceptions>");
    }
    x.push("</Calendar>");
  }
  x.push("</Calendars>");

  // ---- tasks --------------------------------------------------------------
  x.push("<Tasks>");
  outline.forEach((t, index) => {
    const input = inputById.get(t.id)!;
    const cal = new WorkCalendar(defs.get(t.calendarId)!);
    x.push("<Task>");
    el("UID", uidOf.get(t.id)!);
    el("ID", index + 1);
    el("Name", t.name);
    el("Type", 1);
    el("IsNull", 0);
    el("WBS", t.wbs);
    el("OutlineNumber", t.wbs);
    el("OutlineLevel", t.outlineLevel);
    el("Priority", 500);
    date("Start", t.start);
    date("Finish", t.finish);
    el("Duration", formatTimeSpan(t.duration));
    el("DurationFormat", DurationFormat.days);
    el("Work", "PT0H0M0S");
    el("ResumeValid", 0);
    el("EffortDriven", 0);
    el("Recurring", 0);
    el("OverAllocated", 0);
    el("Estimated", 0);
    bool("Milestone", t.isMilestone);
    bool("Summary", t.isSummary);
    bool("Critical", t.isCritical);
    el("IsSubproject", 0);
    el("IsSubprojectReadOnly", 0);
    el("ExternalTask", 0);
    date("EarlyStart", t.earlyStart);
    date("EarlyFinish", t.earlyFinish);
    date("LateStart", t.lateStart);
    date("LateFinish", t.lateFinish);
    el("StartVariance", 0);
    el("FinishVariance", 0);
    el("WorkVariance", 0);
    el("FreeSlack", Math.round(t.freeSlack * 10));
    el("TotalSlack", Math.round(t.totalSlack * 10));
    el("FixedCost", 0);
    el("FixedCostAccrual", 3);
    el("PercentComplete", input.percentComplete ?? 0);
    el("PercentWorkComplete", input.percentComplete ?? 0);
    el("Cost", 0);
    el("OvertimeCost", 0);
    el("OvertimeWork", "PT0H0M0S");
    el("ActualDuration", "PT0H0M0S");
    el("ActualCost", 0);
    el("ActualOvertimeCost", 0);
    el("ActualWork", "PT0H0M0S");
    el("ActualOvertimeWork", "PT0H0M0S");
    el("RegularWork", "PT0H0M0S");
    el("RemainingDuration", formatTimeSpan(t.duration));
    el("RemainingCost", 0);
    el("RemainingWork", "PT0H0M0S");
    el("RemainingOvertimeCost", 0);
    el("RemainingOvertimeWork", "PT0H0M0S");
    el("ACWP", 0);
    el("CV", 0);
    el("ConstraintType", CONSTRAINT_TO_CODE[t.constraintType]);
    el("CalendarUID", t.calendarId === projectCalId ? -1 : calendarUid.get(t.calendarId)!);
    date("ConstraintDate", input.constraintDate);
    date("Deadline", input.deadline);
    el("LevelAssignments", 1);
    el("LevelingCanSplit", 1);
    el("LevelingDelay", 0);
    el("LevelingDelayFormat", DurationFormat.elapsedDays);
    el("IgnoreResourceCalendar", 0);
    el("HideBar", 0);
    el("Rollup", 0);
    el("BCWS", 0);
    el("BCWP", 0);
    el("PhysicalPercentComplete", 0);
    el("EarnedValueMethod", 0);
    for (const d of predsOf.get(t.id) ?? []) {
      const predUid = uidOf.get(d.predecessorId);
      if (predUid === undefined) continue;
      x.push("<PredecessorLink>");
      el("PredecessorUID", predUid);
      el("Type", LINK_TYPE_TO_CODE[d.type ?? "FS"]);
      el("CrossProject", 0);
      el("LinkLag", Math.round((d.lag ?? 0) * 10));
      el("LagFormat", DurationFormat.days);
      x.push("</PredecessorLink>");
    }
    el("IsPublished", 1);
    el("CommitmentType", 0);
    // Manual scheduling (Project 2010+). Written after the 2007 elements to respect schema order.
    bool("Manual", t.schedulingMode === "manual");
    if (t.schedulingMode === "manual") {
      date("ManualStart", t.start);
      date("ManualFinish", t.finish);
      el("ManualDuration", formatTimeSpan(t.duration));
    }
    void cal;
    x.push("</Task>");
  });
  x.push("</Tasks>");
  x.push("<Resources/>");
  x.push("<Assignments/>");
  x.push("</Project>");
  return x.join("\n");
}

function firstStart(def: CalendarDefinition): number {
  for (const d of def.weekDays) if (d.length > 0) return d[0]!.from;
  return 8 * 60;
}
function lastEnd(def: CalendarDefinition): number {
  for (const d of def.weekDays) if (d.length > 0) return d[d.length - 1]!.to;
  return 17 * 60;
}
