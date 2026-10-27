import type { AssignmentInput, ProjectInput, ResourceInput, TaskInput, TaskType } from "./types.js";
import { assignmentWork } from "./resources.js";

/**
 * Editing helpers that keep Duration × Units = Work consistent according to the task type,
 * like MS Project's scheduling formula. All functions are pure and return a new ProjectInput.
 * They only touch assignments of work resources; material and cost assignments are left alone.
 */

function taskOf(p: ProjectInput, taskId: string): TaskInput {
  const t = p.tasks.find((x) => x.id === taskId);
  if (!t) throw new Error(`Unknown task "${taskId}"`);
  return t;
}
function resourceOf(p: ProjectInput, id: string): ResourceInput | undefined {
  return p.resources?.find((r) => r.id === id);
}
function isWorkAssignment(p: ProjectInput, a: AssignmentInput): boolean {
  return (resourceOf(p, a.resourceId)?.type ?? "work") === "work";
}
function workAssignments(p: ProjectInput, taskId: string): AssignmentInput[] {
  return (p.assignments ?? []).filter((a) => a.taskId === taskId && isWorkAssignment(p, a));
}
function totalUnits(list: AssignmentInput[]): number {
  return list.reduce((s, a) => s + (a.units ?? 1), 0);
}
function withTask(p: ProjectInput, taskId: string, patch: Partial<TaskInput>): ProjectInput {
  return { ...p, tasks: p.tasks.map((t) => (t.id === taskId ? { ...t, ...patch } : t)) };
}
function withAssignments(p: ProjectInput, taskId: string, next: AssignmentInput[]): ProjectInput {
  const others = (p.assignments ?? []).filter((a) => a.taskId !== taskId || !isWorkAssignment(p, a));
  return { ...p, assignments: [...others, ...next] };
}

/** Change a task's duration; work or units follow according to the task type. */
export function setTaskDuration(p: ProjectInput, taskId: string, duration: number): ProjectInput {
  const task = taskOf(p, taskId);
  const type: TaskType = task.taskType ?? "fixedUnits";
  const list = workAssignments(p, taskId);
  let next = withTask(p, taskId, { duration });
  if (list.length === 0) return next;
  if (type === "fixedWork") {
    // Keep each assignment's work; its units adapt to the new duration.
    const updated = list.map((a) => {
      const work = assignmentWork(a, resourceOf(p, a.resourceId), task.duration ?? 0);
      return { ...a, work, units: duration > 0 ? work / duration : (a.units ?? 1) };
    });
    next = withAssignments(next, taskId, updated);
  } else {
    // fixedUnits and fixedDuration: work = new duration × units.
    const updated = list.map((a) => ({ ...a, work: duration * (a.units ?? 1) }));
    next = withAssignments(next, taskId, updated);
  }
  return next;
}

/** Change a task's total work; it is split across assignments in proportion to their units. */
export function setTaskWork(p: ProjectInput, taskId: string, work: number): ProjectInput {
  const task = taskOf(p, taskId);
  const type: TaskType = task.taskType ?? "fixedUnits";
  const list = workAssignments(p, taskId);
  if (list.length === 0) throw new Error(`Task "${taskId}" has no work resources; assign one before setting work`);
  const units = totalUnits(list);
  if (type === "fixedDuration") {
    const duration = task.duration ?? 0;
    const updated = list.map((a) => {
      const share = (a.units ?? 1) / units;
      const w = work * share;
      return { ...a, work: w, units: duration > 0 ? w / duration : (a.units ?? 1) };
    });
    return withAssignments(p, taskId, updated);
  }
  // fixedUnits and fixedWork: duration = work / Σunits
  const duration = units > 0 ? work / units : (task.duration ?? 0);
  const updated = list.map((a) => ({ ...a, work: work * ((a.units ?? 1) / units) }));
  return withAssignments(withTask(p, taskId, { duration }), taskId, updated);
}

/** Change the units of one assignment; duration or work follow according to the task type. */
export function setAssignmentUnits(p: ProjectInput, taskId: string, resourceId: string, units: number): ProjectInput {
  const task = taskOf(p, taskId);
  const type: TaskType = task.taskType ?? "fixedUnits";
  const list = workAssignments(p, taskId);
  const target = list.find((a) => a.resourceId === resourceId);
  if (!target) throw new Error(`Resource "${resourceId}" is not assigned to task "${taskId}"`);
  const duration = task.duration ?? 0;
  if (type === "fixedWork") {
    const work = assignmentWork(target, resourceOf(p, resourceId), duration);
    const updated = list.map((a) => (a === target ? { ...a, units, work } : a));
    // Duration = longest assignment (work / units).
    const newDuration = Math.max(...updated.map((a) => (a.units ?? 1) > 0 ? assignmentWork(a, resourceOf(p, a.resourceId), duration) / (a.units ?? 1) : 0));
    return withAssignments(withTask(p, taskId, { duration: newDuration }), taskId, updated);
  }
  // fixedUnits and fixedDuration: work = duration × new units
  const updated = list.map((a) => (a === target ? { ...a, units, work: duration * units } : a));
  return withAssignments(p, taskId, updated);
}

/**
 * Assign a resource to a task. Effort-driven tasks keep their total work and shorten
 * (or, when fixedDuration, spread units); otherwise the new assignment adds work.
 */
export function assignResource(p: ProjectInput, taskId: string, resourceId: string, units = 1): ProjectInput {
  const task = taskOf(p, taskId);
  const resource = resourceOf(p, resourceId);
  if (!resource) throw new Error(`Unknown resource "${resourceId}"`);
  const existing = p.assignments ?? [];
  if (existing.some((a) => a.taskId === taskId && a.resourceId === resourceId)) return p;
  if ((resource.type ?? "work") !== "work") return { ...p, assignments: [...existing, { taskId, resourceId, units }] };

  const duration = task.duration ?? 0;
  const list = workAssignments(p, taskId);
  const type: TaskType = task.taskType ?? "fixedUnits";
  if (!task.effortDriven || list.length === 0 || type === "fixedWork" && list.length === 0) {
    const added: AssignmentInput = { taskId, resourceId, units, work: duration * units };
    return { ...p, assignments: [...existing, added] };
  }
  // Effort-driven: total work stays, redistributed by units.
  const total = list.reduce((s, a) => s + assignmentWork(a, resourceOf(p, a.resourceId), duration), 0);
  const all = [...list, { taskId, resourceId, units }];
  const sumUnits = totalUnits(all);
  if (type === "fixedDuration") {
    const updated = all.map((a) => ({ ...a, work: total * ((a.units ?? 1) / sumUnits), units: duration > 0 ? (total * ((a.units ?? 1) / sumUnits)) / duration : (a.units ?? 1) }));
    return withAssignments(p, taskId, updated);
  }
  const newDuration = sumUnits > 0 ? total / sumUnits : duration;
  const updated = all.map((a) => ({ ...a, work: total * ((a.units ?? 1) / sumUnits) }));
  return withAssignments(withTask(p, taskId, { duration: newDuration }), taskId, updated);
}

/** Remove an assignment. Effort-driven tasks keep their total work and lengthen. */
export function unassignResource(p: ProjectInput, taskId: string, resourceId: string): ProjectInput {
  const task = taskOf(p, taskId);
  const existing = p.assignments ?? [];
  const target = existing.find((a) => a.taskId === taskId && a.resourceId === resourceId);
  if (!target) return p;
  const without = existing.filter((a) => a !== target);
  if (!isWorkAssignment(p, target) || !task.effortDriven) return { ...p, assignments: without };
  const duration = task.duration ?? 0;
  const remaining = without.filter((a) => a.taskId === taskId && isWorkAssignment(p, a));
  if (remaining.length === 0) return { ...p, assignments: without };
  const total = workAssignments(p, taskId).reduce((s, a) => s + assignmentWork(a, resourceOf(p, a.resourceId), duration), 0);
  const sumUnits = totalUnits(remaining);
  const type: TaskType = task.taskType ?? "fixedUnits";
  const updated = remaining.map((a) => ({ ...a, work: total * ((a.units ?? 1) / sumUnits) }));
  const base = { ...p, assignments: without };
  if (type === "fixedDuration") {
    return withAssignments(base, taskId, updated.map((a) => ({ ...a, units: duration > 0 ? a.work / duration : (a.units ?? 1) })));
  }
  return withAssignments(withTask(base, taskId, { duration: sumUnits > 0 ? total / sumUnits : duration }), taskId, updated);
}
