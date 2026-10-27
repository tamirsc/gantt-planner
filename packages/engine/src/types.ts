import type { CalendarDefinition } from "./calendar.js";

export type DependencyType = "FS" | "SS" | "FF" | "SF";

export type ConstraintType =
  | "ASAP" // As Soon As Possible (default)
  | "ALAP" // As Late As Possible
  | "SNET" // Start No Earlier Than
  | "SNLT" // Start No Later Than
  | "FNET" // Finish No Earlier Than
  | "FNLT" // Finish No Later Than
  | "MSO" // Must Start On
  | "MFO"; // Must Finish On

export type SchedulingMode = "auto" | "manual";

/** MS Project task types: which of duration, units and work stays fixed when another changes. */
export type TaskType = "fixedUnits" | "fixedDuration" | "fixedWork";

export type ResourceType = "work" | "material" | "cost";

export interface ResourceInput {
  id: string;
  name?: string;
  /** Defaults to "work". */
  type?: ResourceType;
  /** Capacity as a fraction of the calendar (1 = 100%, 3 = three people). Work resources only. Defaults to 1. */
  maxUnits?: number;
  /** Calendar id for work resources; defaults to the project calendar. */
  calendarId?: string;
  /** Cost per working hour (work) or per unit (material). */
  standardRate?: number;
  /** Fixed cost charged once per assignment. */
  costPerUse?: number;
}

export interface AssignmentInput {
  taskId: string;
  resourceId: string;
  /** Work: fraction of the resource's time (1 = 100%). Material: quantity. Defaults to 1. */
  units?: number;
  /**
   * Work in minutes. When omitted on a work resource it is derived as duration × units.
   * Use the helpers in assignments.ts to keep duration, units and work consistent.
   */
  work?: number;
  /** Cost resources: the amount charged. */
  cost?: number;
}

export interface BaselineTaskValues {
  start: number;
  finish: number;
  duration: number;
  work: number;
  cost: number;
}

export interface BaselineInput {
  /** 0 = "Baseline", 1–10 = "Baseline 1" … "Baseline 10". */
  index: number;
  takenAt: number;
  tasks: Record<string, BaselineTaskValues>;
}

export interface TaskInput {
  id: string;
  name?: string;
  /** Parent task id for WBS hierarchy. Omit or null for top-level tasks. */
  parentId?: string | null;
  /**
   * Duration in working minutes of the task's calendar. Ignored for summary
   * tasks (derived from children). 0 or omitted on a leaf makes a milestone.
   */
  duration?: number;
  /** Explicit milestone flag; a milestone with duration > 0 is marked at its finish. */
  isMilestone?: boolean;
  /** "auto" (default): dates computed by the engine. "manual": `start` (and `finish` or `duration`) are fixed. */
  schedulingMode?: SchedulingMode;
  start?: number;
  finish?: number;
  constraintType?: ConstraintType;
  constraintDate?: number;
  /** Soft target; late finish is capped at the deadline and a warning is emitted when missed. */
  deadline?: number;
  /** Calendar id; defaults to the project calendar. */
  calendarId?: string;
  percentComplete?: number;
  /** Defaults to "fixedUnits". */
  taskType?: TaskType;
  /** Effort-driven: adding resources shortens the task (total work stays). Defaults to false. */
  effortDriven?: boolean;
  /** Cost not tied to a resource. */
  fixedCost?: number;
}

export interface DependencyInput {
  predecessorId: string;
  successorId: string;
  /** Defaults to "FS". */
  type?: DependencyType;
  /** Lag (positive) or lead (negative) in working minutes. Defaults to 0. */
  lag?: number;
}

export type LagCalendarRule = "successor" | "predecessor" | "project";

export interface ScheduleOptions {
  /**
   * Which calendar measures lag/lead time. Defaults to "successor".
   * NOTE: to be validated against MS Project behaviour with golden tests.
   */
  lagCalendar?: LagCalendarRule;
  /** Tasks with total slack ≤ this many minutes are critical. Defaults to 0. */
  criticalSlackThreshold?: number;
}

export interface ProjectInput {
  /** Project start (epoch ms, project time). */
  start: number;
  /** Project calendar id. Defaults to the first calendar in `calendars`, else the Israel standard preset. */
  calendarId?: string;
  calendars?: CalendarDefinition[];
  tasks: TaskInput[];
  dependencies?: DependencyInput[];
  resources?: ResourceInput[];
  assignments?: AssignmentInput[];
  baselines?: BaselineInput[];
  options?: ScheduleOptions;
}

export interface ScheduledTask {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  outlineLevel: number;
  wbs: string;
  isSummary: boolean;
  isMilestone: boolean;
  schedulingMode: SchedulingMode;
  constraintType: ConstraintType;
  calendarId: string;
  /** Working minutes (summary: working span in its calendar). */
  duration: number;
  /** Scheduled dates (early dates, except ALAP → late dates, manual → as given). */
  start: number;
  finish: number;
  earlyStart: number;
  earlyFinish: number;
  lateStart: number;
  lateFinish: number;
  /** Working minutes the task can slip without delaying the project finish (or violating a deadline/constraint). Negative = conflict. */
  totalSlack: number;
  /** Working minutes the task can slip without delaying any successor. */
  freeSlack: number;
  isCritical: boolean;
  /** Total work of all assignments in minutes (summaries roll up). */
  work: number;
  /** Assignment costs plus fixed cost (summaries roll up). */
  cost: number;
  /** Values from baseline 0 when one was taken for this task. */
  baseline: BaselineTaskValues | null;
  /** Working minutes later (positive) or earlier than the baseline; null without a baseline. */
  startVariance: number | null;
  finishVariance: number | null;
  workVariance: number | null;
  costVariance: number | null;
}

export interface ScheduledAssignment {
  taskId: string;
  resourceId: string;
  units: number;
  work: number;
  cost: number;
  start: number;
  finish: number;
}

export interface ResourceUsage {
  id: string;
  name: string;
  type: ResourceType;
  maxUnits: number;
  /** Total assigned work in minutes. */
  work: number;
  cost: number;
  /** Highest units demanded on any single day. */
  peakUnits: number;
  /** Day starts (epoch ms) on which demand exceeds capacity. */
  overallocatedDays: number[];
  isOverallocated: boolean;
}

export type WarningCode =
  | "CONSTRAINT_CONFLICT"
  | "DEADLINE_MISSED"
  | "NEGATIVE_SLACK"
  | "SUMMARY_DEPENDENCY_APPROXIMATED"
  | "MANUAL_TASK_BEFORE_PREDECESSOR"
  | "RESOURCE_OVERALLOCATED"
  | "UNKNOWN_ASSIGNMENT_TARGET";

export interface ScheduleWarning {
  code: WarningCode;
  taskId: string;
  message: string;
}

export interface ScheduleResult {
  projectStart: number;
  projectFinish: number;
  /** Tasks keyed by id. */
  tasks: Record<string, ScheduledTask>;
  /** All task ids in topological (scheduling) order. */
  order: string[];
  /** Ids of critical leaf tasks and milestones, in scheduling order. */
  criticalPath: string[];
  assignments: ScheduledAssignment[];
  resources: Record<string, ResourceUsage>;
  /** Total work and cost of the project. */
  work: number;
  cost: number;
  warnings: ScheduleWarning[];
}

export class SchedulingError extends Error {
  constructor(
    message: string,
    readonly code: "CYCLE" | "UNKNOWN_TASK" | "UNKNOWN_CALENDAR" | "INVALID_INPUT",
    readonly details?: unknown,
  ) {
    super(message);
    this.name = "SchedulingError";
  }
}
