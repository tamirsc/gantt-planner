import { MS_PER_DAY, dayStart } from "./time.js";
import type { WorkCalendar } from "./calendar.js";
import type {
  AssignmentInput,
  ProjectInput,
  ResourceInput,
  ResourceUsage,
  ScheduleWarning,
  ScheduledAssignment,
} from "./types.js";

export interface TaskDates {
  start: number;
  finish: number;
  duration: number;
  isSummary: boolean;
  cal: WorkCalendar;
}

/** Work of an assignment: explicit work, else duration × units for work resources. */
export function assignmentWork(a: AssignmentInput, resource: ResourceInput | undefined, taskDuration: number): number {
  if (a.work !== undefined) return a.work;
  if (!resource || (resource.type ?? "work") !== "work") return 0;
  return taskDuration * (a.units ?? 1);
}

export function assignmentCost(a: AssignmentInput, resource: ResourceInput | undefined, work: number): number {
  if (!resource) return 0;
  const type = resource.type ?? "work";
  if (type === "cost") return a.cost ?? 0;
  const perUse = resource.costPerUse ?? 0;
  if (type === "material") return (a.units ?? 1) * (resource.standardRate ?? 0) + perUse;
  return (work / 60) * (resource.standardRate ?? 0) + perUse;
}

/**
 * Compute scheduled assignments and per-resource usage (work, cost, daily load vs capacity).
 * Work is spread evenly over the task's working time in the task calendar.
 */
export function computeResources(
  input: ProjectInput,
  tasks: Map<string, TaskDates>,
  calendarFor: (id: string | undefined) => WorkCalendar,
  warn: (code: ScheduleWarning["code"], taskId: string, message: string) => void,
): { assignments: ScheduledAssignment[]; resources: Record<string, ResourceUsage>; taskWork: Map<string, number>; taskCost: Map<string, number> } {
  const resourceById = new Map((input.resources ?? []).map((r) => [r.id, r] as const));
  const assignments: ScheduledAssignment[] = [];
  const taskWork = new Map<string, number>();
  const taskCost = new Map<string, number>();
  const load = new Map<string, Map<number, number>>(); // resource → day → minutes×units demanded

  for (const a of input.assignments ?? []) {
    const task = tasks.get(a.taskId);
    const resource = resourceById.get(a.resourceId);
    if (!task || !resource) {
      warn("UNKNOWN_ASSIGNMENT_TARGET", a.taskId, `Assignment ${a.taskId} → ${a.resourceId} refers to an unknown task or resource.`);
      continue;
    }
    if (task.isSummary) continue;
    const units = a.units ?? 1;
    const work = assignmentWork(a, resource, task.duration);
    const cost = assignmentCost(a, resource, work);
    assignments.push({ taskId: a.taskId, resourceId: a.resourceId, units, work, cost, start: task.start, finish: task.finish });
    taskWork.set(a.taskId, (taskWork.get(a.taskId) ?? 0) + work);
    taskCost.set(a.taskId, (taskCost.get(a.taskId) ?? 0) + cost);

    if ((resource.type ?? "work") !== "work" || task.duration <= 0 || work <= 0) continue;
    // Daily demand: the share of the task's working minutes on each day, scaled so the total equals `work`.
    const perTaskMinute = work / task.duration;
    let dayLoad = load.get(resource.id);
    if (!dayLoad) load.set(resource.id, (dayLoad = new Map()));
    const lastDay = dayStart(task.finish);
    for (let day = dayStart(task.start); day <= lastDay; day += MS_PER_DAY) {
      const minutes = task.cal.workingMinutesBetween(Math.max(day, task.start), Math.min(day + MS_PER_DAY, task.finish));
      if (minutes > 0) dayLoad.set(day, (dayLoad.get(day) ?? 0) + minutes * perTaskMinute);
    }
  }

  const resources: Record<string, ResourceUsage> = {};
  for (const r of input.resources ?? []) {
    const type = r.type ?? "work";
    const maxUnits = r.maxUnits ?? 1;
    const cal = calendarFor(r.calendarId);
    let work = 0;
    let cost = 0;
    for (const a of assignments) {
      if (a.resourceId !== r.id) continue;
      work += a.work;
      cost += a.cost;
    }
    let peakUnits = 0;
    const overallocatedDays: number[] = [];
    for (const [day, minutes] of load.get(r.id) ?? []) {
      const capacityMinutes = cal.workingMinutesBetween(day, day + MS_PER_DAY);
      const unitsDemanded = capacityMinutes > 0 ? minutes / capacityMinutes : Infinity;
      peakUnits = Math.max(peakUnits, unitsDemanded);
      if (minutes > capacityMinutes * maxUnits + 1e-6) overallocatedDays.push(day);
    }
    overallocatedDays.sort((a, b) => a - b);
    const usage: ResourceUsage = {
      id: r.id,
      name: r.name ?? r.id,
      type,
      maxUnits,
      work,
      cost,
      peakUnits: Number.isFinite(peakUnits) ? Math.round(peakUnits * 1000) / 1000 : Infinity,
      overallocatedDays,
      isOverallocated: overallocatedDays.length > 0,
    };
    if (usage.isOverallocated) {
      const first = new Date(overallocatedDays[0]!).toISOString().slice(0, 10);
      warn("RESOURCE_OVERALLOCATED", r.id, `Resource "${usage.name}" is overallocated on ${overallocatedDays.length} day(s), first on ${first}.`);
    }
    resources[r.id] = usage;
  }
  return { assignments, resources, taskWork, taskCost };
}
