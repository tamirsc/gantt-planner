import type { ConstraintType, DependencyType, ResourceType, TaskType } from "@gantt-planner/engine";

export const MSPDI_NAMESPACE = "http://schemas.microsoft.com/project";

/** PredecessorLink/Type */
export const LINK_TYPE_FROM_CODE: Record<number, DependencyType> = { 0: "FF", 1: "FS", 2: "SF", 3: "SS" };
export const LINK_TYPE_TO_CODE: Record<DependencyType, number> = { FF: 0, FS: 1, SF: 2, SS: 3 };

/** Task/ConstraintType */
export const CONSTRAINT_FROM_CODE: Record<number, ConstraintType> = {
  0: "ASAP",
  1: "ALAP",
  2: "MSO",
  3: "MFO",
  4: "SNET",
  5: "SNLT",
  6: "FNET",
  7: "FNLT",
};
export const CONSTRAINT_TO_CODE: Record<ConstraintType, number> = {
  ASAP: 0,
  ALAP: 1,
  MSO: 2,
  MFO: 3,
  SNET: 4,
  SNLT: 5,
  FNET: 6,
  FNLT: 7,
};

/** DurationFormat / LagFormat codes. */
export const DurationFormat = {
  minutes: 3,
  elapsedMinutes: 4,
  hours: 5,
  elapsedHours: 6,
  days: 7,
  elapsedDays: 8,
  weeks: 9,
  elapsedWeeks: 10,
  months: 11,
  elapsedMonths: 12,
  percent: 19,
  elapsedPercent: 20,
} as const;

const ELAPSED_FORMATS = new Set([4, 6, 8, 10, 12, 20, 36, 38, 40, 42, 44, 52]);
const PERCENT_FORMATS = new Set([19, 20, 51, 52]);

export function isElapsedFormat(code: number | undefined): boolean {
  return code !== undefined && ELAPSED_FORMATS.has(code);
}
export function isPercentFormat(code: number | undefined): boolean {
  return code !== undefined && PERCENT_FORMATS.has(code);
}

/** Task/Type */
export const TASK_TYPE_FROM_CODE: Record<number, TaskType> = { 0: "fixedUnits", 1: "fixedDuration", 2: "fixedWork" };
export const TASK_TYPE_TO_CODE: Record<TaskType, number> = { fixedUnits: 0, fixedDuration: 1, fixedWork: 2 };

/** Resource/Type */
export const RESOURCE_TYPE_FROM_CODE: Record<number, ResourceType> = { 0: "material", 1: "work", 2: "cost" };
export const RESOURCE_TYPE_TO_CODE: Record<ResourceType, number> = { material: 0, work: 1, cost: 2 };

/** Resource/StandardRateFormat: 1 minute, 2 hour, 3 day, 4 week, 5 month, 7 year, 8 material */
export const RATE_FORMAT_HOURLY = 2;

/** Assignment/ResourceUID for an assignment without a resource. */
export const UNASSIGNED_RESOURCE_UID = -65535;
