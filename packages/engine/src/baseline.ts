import type { BaselineInput, BaselineTaskValues, ProjectInput, ScheduleResult } from "./types.js";

/** Snapshot the current schedule as baseline `index` (0 by default), replacing any previous one. */
export function takeBaseline(project: ProjectInput, result: ScheduleResult, index = 0, takenAt = Date.now()): ProjectInput {
  if (index < 0 || index > 10 || !Number.isInteger(index)) throw new Error("Baseline index must be 0–10");
  const tasks: Record<string, BaselineTaskValues> = {};
  for (const t of Object.values(result.tasks)) {
    tasks[t.id] = { start: t.start, finish: t.finish, duration: t.duration, work: t.work, cost: t.cost };
  }
  const baseline: BaselineInput = { index, takenAt, tasks };
  const others = (project.baselines ?? []).filter((b) => b.index !== index);
  return { ...project, baselines: [...others, baseline].sort((a, b) => a.index - b.index) };
}

export function clearBaseline(project: ProjectInput, index = 0): ProjectInput {
  return { ...project, baselines: (project.baselines ?? []).filter((b) => b.index !== index) };
}
