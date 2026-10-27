import { WorkCalendar, israelStandard, presetCalendars, type CalendarDefinition } from "./calendar.js";
import { topologicalOrder } from "./graph.js";
import {
  SchedulingError,
  type ConstraintType,
  type DependencyType,
  type ProjectInput,
  type ScheduleResult,
  type ScheduleWarning,
  type ScheduledTask,
  type SchedulingMode,
  type TaskInput,
} from "./types.js";

interface Dep {
  pred: string;
  succ: string;
  type: DependencyType;
  lag: number;
  /** True when the dependency was declared on an ancestor summary and is applied to this leaf. */
  inherited: boolean;
}

interface Node {
  id: string;
  name: string;
  parentId: string | null;
  children: string[];
  level: number;
  wbs: string;
  isSummary: boolean;
  isMilestone: boolean;
  mode: SchedulingMode;
  constraint: ConstraintType;
  constraintDate: number | undefined;
  deadline: number | undefined;
  cal: WorkCalendar;
  duration: number;
  /** Own dependencies as declared. */
  ownPreds: Dep[];
  ownSuccs: Dep[];
  /** Effective dependencies for scheduling a leaf: own + inherited from ancestors. */
  preds: Dep[];
  succs: Dep[];
  /** Current scheduled dates during passes. */
  s: number;
  f: number;
  es: number;
  ef: number;
  ls: number;
  lf: number;
  /** Dates fixed by the user (manual) or pinned (ALAP second pass). */
  pinned: boolean;
}

/**
 * Compute a full schedule for a project: forward pass (early dates), backward
 * pass (late dates), slack, critical path. Pure and deterministic.
 */
export function schedule(input: ProjectInput): ScheduleResult {
  const warnings: ScheduleWarning[] = [];
  const warn = (code: ScheduleWarning["code"], taskId: string, message: string) => {
    warnings.push({ code, taskId, message });
  };

  // ---- calendars ----------------------------------------------------------
  const calendars = new Map<string, WorkCalendar>();
  for (const def of presetCalendars) calendars.set(def.id, new WorkCalendar(def));
  for (const def of input.calendars ?? []) calendars.set(def.id, new WorkCalendar(def));
  const projectCalId = input.calendarId ?? input.calendars?.[0]?.id ?? israelStandard.id;
  const projectCal = calendars.get(projectCalId);
  if (!projectCal) throw new SchedulingError(`Unknown project calendar "${projectCalId}"`, "UNKNOWN_CALENDAR");
  const lagRule = input.options?.lagCalendar ?? "successor";
  const criticalThreshold = input.options?.criticalSlackThreshold ?? 0;

  // ---- nodes --------------------------------------------------------------
  const nodes = new Map<string, Node>();
  for (const t of input.tasks) {
    if (nodes.has(t.id)) throw new SchedulingError(`Duplicate task id "${t.id}"`, "INVALID_INPUT");
    const cal = t.calendarId ? calendars.get(t.calendarId) : projectCal;
    if (!cal) throw new SchedulingError(`Task "${t.id}": unknown calendar "${t.calendarId}"`, "UNKNOWN_CALENDAR");
    if (t.duration !== undefined && (t.duration < 0 || !Number.isFinite(t.duration))) {
      throw new SchedulingError(`Task "${t.id}": duration must be a non-negative number of minutes`, "INVALID_INPUT");
    }
    nodes.set(t.id, {
      id: t.id,
      name: t.name ?? t.id,
      parentId: t.parentId ?? null,
      children: [],
      level: 0,
      wbs: "",
      isSummary: false,
      isMilestone: false,
      mode: t.schedulingMode ?? "auto",
      constraint: t.constraintType ?? "ASAP",
      constraintDate: t.constraintDate,
      deadline: t.deadline,
      cal,
      duration: t.duration ?? 0,
      ownPreds: [],
      ownSuccs: [],
      preds: [],
      succs: [],
      s: NaN,
      f: NaN,
      es: NaN,
      ef: NaN,
      ls: NaN,
      lf: NaN,
      pinned: false,
    });
  }
  for (const n of nodes.values()) {
    if (n.parentId !== null) {
      const p = nodes.get(n.parentId);
      if (!p) throw new SchedulingError(`Task "${n.id}": unknown parent "${n.parentId}"`, "UNKNOWN_TASK");
      p.children.push(n.id);
      p.isSummary = true;
    }
  }
  for (const n of nodes.values()) {
    if (n.isSummary) {
      n.mode = "auto";
      n.isMilestone = false;
    } else {
      n.isMilestone = n.duration === 0 || (input.tasks.find((t) => t.id === n.id)?.isMilestone ?? false);
    }
    if (n.constraint !== "ASAP" && n.constraint !== "ALAP" && n.constraintDate === undefined) {
      throw new SchedulingError(`Task "${n.id}": constraint ${n.constraint} requires constraintDate`, "INVALID_INPUT");
    }
    if (n.mode === "manual" && !n.isSummary) {
      const t = input.tasks.find((x) => x.id === n.id)!;
      if (t.start === undefined) throw new SchedulingError(`Manual task "${n.id}" requires start`, "INVALID_INPUT");
    }
  }

  // Outline levels and WBS codes (input order within each parent).
  const roots = [...nodes.values()].filter((n) => n.parentId === null);
  const assignWbs = (list: Node[], prefix: string, level: number) => {
    list.forEach((n, i) => {
      n.wbs = prefix ? `${prefix}.${i + 1}` : `${i + 1}`;
      n.level = level;
      assignWbs(n.children.map((c) => nodes.get(c)!), n.wbs, level + 1);
    });
  };
  assignWbs(roots, "", 1);
  // Guard against parent cycles (a→b→a) which would leave nodes without wbs.
  for (const n of nodes.values()) {
    if (!n.wbs) throw new SchedulingError(`Task "${n.id}" is part of a parent/child cycle`, "CYCLE");
  }

  // ---- dependencies -------------------------------------------------------
  for (const d of input.dependencies ?? []) {
    const p = nodes.get(d.predecessorId);
    const s = nodes.get(d.successorId);
    if (!p) throw new SchedulingError(`Dependency: unknown predecessor "${d.predecessorId}"`, "UNKNOWN_TASK");
    if (!s) throw new SchedulingError(`Dependency: unknown successor "${d.successorId}"`, "UNKNOWN_TASK");
    if (p === s) throw new SchedulingError(`Task "${p.id}" cannot depend on itself`, "CYCLE", { cycle: [p.id, p.id] });
    const dep: Dep = { pred: p.id, succ: s.id, type: d.type ?? "FS", lag: d.lag ?? 0, inherited: false };
    p.ownSuccs.push(dep);
    s.ownPreds.push(dep);
  }

  const ancestorsOf = (n: Node): Node[] => {
    const out: Node[] = [];
    let cur = n.parentId ? nodes.get(n.parentId) : undefined;
    while (cur) {
      out.push(cur);
      cur = cur.parentId ? nodes.get(cur.parentId) : undefined;
    }
    return out;
  };
  const approximated = new Set<Dep>();
  for (const n of nodes.values()) {
    n.preds = [...n.ownPreds];
    n.succs = [...n.ownSuccs];
    if (n.isSummary) continue;
    for (const a of ancestorsOf(n)) {
      for (const d of a.ownPreds) {
        n.preds.push({ ...d, succ: n.id, inherited: true });
        if ((d.type === "FF" || d.type === "SF") && !approximated.has(d)) {
          approximated.add(d);
          warn(
            "SUMMARY_DEPENDENCY_APPROXIMATED",
            a.id,
            `${d.type} dependency ${d.pred} → ${d.succ} targets a summary task; applied to every subtask's finish.`,
          );
        }
      }
      for (const d of a.ownSuccs) {
        n.succs.push({ ...d, pred: n.id, inherited: true });
        if ((d.type === "SS" || d.type === "SF") && !approximated.has(d)) {
          approximated.add(d);
          warn(
            "SUMMARY_DEPENDENCY_APPROXIMATED",
            a.id,
            `${d.type} dependency ${d.pred} → ${d.succ} starts from a summary task; late dates of its subtasks are conservative.`,
          );
        }
      }
    }
  }

  // ---- topological order ---------------------------------------------------
  const ids = input.tasks.map((t) => t.id);
  const edges = new Map<string, Set<string>>();
  const addEdge = (a: string, b: string) => {
    let set = edges.get(a);
    if (!set) edges.set(a, (set = new Set()));
    set.add(b);
  };
  for (const n of nodes.values()) {
    if (n.parentId) addEdge(n.id, n.parentId);
    for (const d of n.preds) addEdge(d.pred, n.id);
  }
  const order = topologicalOrder(ids, edges);
  const orderedNodes = order.map((id) => nodes.get(id)!);

  // ---- helpers ------------------------------------------------------------
  const lagCal = (d: Dep): WorkCalendar =>
    lagRule === "project" ? projectCal : lagRule === "predecessor" ? nodes.get(d.pred)!.cal : nodes.get(d.succ)!.cal;
  const snapStart = (n: Node, t: number) => (n.duration > 0 ? n.cal.nextWorkingTime(t) : t);
  const snapFinish = (n: Node, t: number) => (n.duration > 0 ? n.cal.prevWorkingTime(t) : t);
  const finishOf = (n: Node, start: number) => (n.duration > 0 ? n.cal.addMinutes(start, n.duration) : start);
  const startOf = (n: Node, finish: number) => (n.duration > 0 ? n.cal.addMinutes(finish, -n.duration) : finish);

  const projectStartSnapped = projectCal.nextWorkingTime(input.start);

  /** Earliest start imposed on `n` by dependency `d` given the predecessor's current dates. */
  const requiredStart = (n: Node, d: Dep): number => {
    const p = nodes.get(d.pred)!;
    const lc = lagCal(d);
    switch (d.type) {
      case "FS":
        return snapStart(n, lc.addMinutes(p.f, d.lag));
      case "SS":
        return snapStart(n, lc.addMinutes(p.s, d.lag));
      case "FF":
        return startOf(n, snapFinish(n, lc.addMinutes(p.f, d.lag)));
      case "SF":
        return startOf(n, snapFinish(n, lc.addMinutes(p.s, d.lag)));
    }
  };

  /** Latest finish allowed for `n` by dependency `d` given the successor's late dates. */
  const allowedLateFinish = (n: Node, d: Dep): number => {
    const sNode = nodes.get(d.succ)!;
    const { ls, lf } = lateOf(sNode);
    const lc = lagCal(d);
    switch (d.type) {
      case "FS":
        return snapFinish(n, lc.addMinutes(ls, -d.lag));
      case "SS":
        return finishOf(n, snapStart(n, lc.addMinutes(ls, -d.lag)));
      case "FF":
        return snapFinish(n, lc.addMinutes(lf, -d.lag));
      case "SF":
        return finishOf(n, snapStart(n, lc.addMinutes(lf, -d.lag)));
    }
  };

  /** Late dates of a node; summaries aggregate their (already processed) descendants on demand. */
  const lateOf = (n: Node): { ls: number; lf: number } => {
    if (!n.isSummary) return { ls: n.ls, lf: n.lf };
    let ls = Infinity;
    let lf = -Infinity;
    for (const c of n.children) {
      const r = lateOf(nodes.get(c)!);
      ls = Math.min(ls, r.ls);
      lf = Math.max(lf, r.lf);
    }
    return { ls, lf };
  };

  // ---- forward pass -------------------------------------------------------
  const forwardPass = (emitWarnings: boolean) => {
    for (const n of orderedNodes) {
      if (n.isSummary) {
        let s = Infinity;
        let f = -Infinity;
        for (const c of n.children) {
          const ch = nodes.get(c)!;
          s = Math.min(s, ch.s);
          f = Math.max(f, ch.f);
        }
        n.s = s;
        n.f = f;
        continue;
      }

      let depStart = -Infinity;
      for (const d of n.preds) depStart = Math.max(depStart, requiredStart(n, d));

      if (n.pinned) {
        if (emitWarnings) {
          n.es = n.s;
          n.ef = n.f;
        }
        if (emitWarnings && n.mode === "manual" && depStart > n.s) {
          warn(
            "MANUAL_TASK_BEFORE_PREDECESSOR",
            n.id,
            `Manually scheduled task starts before its predecessors allow (${iso(n.s)} < ${iso(depStart)}).`,
          );
        }
        continue;
      }

      let start = Math.max(projectStartSnapped, depStart);
      const cd = n.constraintDate;
      if (n.constraint === "SNET") start = Math.max(start, snapStart(n, cd!));
      if (n.constraint === "FNET") start = Math.max(start, startOf(n, snapFinish(n, cd!)));
      // Early dates stay dependency-driven: a forcing constraint (MSO/MFO/SNLT/FNLT)
      // that pulls the task earlier shows up as negative slack, as in MS Project.
      const unforcedStart = start;
      switch (n.constraint) {
        case "ASAP":
        case "ALAP":
        case "SNET":
        case "FNET":
          break;
        case "MSO": {
          const forced = snapStart(n, cd!);
          if (emitWarnings && depStart > forced) conflict(n, depStart, forced);
          start = forced;
          break;
        }
        case "MFO": {
          const forced = startOf(n, snapFinish(n, cd!));
          if (emitWarnings && depStart > forced) conflict(n, depStart, forced);
          start = forced;
          break;
        }
        case "SNLT": {
          const latest = snapStart(n, cd!);
          if (start > latest) {
            if (emitWarnings) conflict(n, start, latest);
            start = latest;
          }
          break;
        }
        case "FNLT": {
          const latest = startOf(n, snapFinish(n, cd!));
          if (start > latest) {
            if (emitWarnings) conflict(n, start, latest);
            start = latest;
          }
          break;
        }
      }
      n.s = start;
      n.f = finishOf(n, start);
      if (emitWarnings) {
        n.es = Math.max(unforcedStart, start);
        n.ef = finishOf(n, n.es);
      }
    }
  };
  const conflict = (n: Node, wanted: number, forced: number) =>
    warn(
      "CONSTRAINT_CONFLICT",
      n.id,
      `${n.constraint} constraint forces start ${iso(forced)} but predecessors require ${iso(wanted)}.`,
    );

  // Manual tasks are pinned from the start.
  for (const n of nodes.values()) {
    if (n.mode !== "manual" || n.isSummary) continue;
    const t = input.tasks.find((x) => x.id === n.id)!;
    n.s = t.start!;
    if (t.finish !== undefined) {
      n.f = t.finish;
      n.duration = Math.max(0, n.cal.workingMinutesBetween(n.s, n.f));
      n.isMilestone = n.duration === 0 || (t.isMilestone ?? false);
    } else {
      n.f = finishOf(n, n.s);
    }
    n.pinned = true;
  }

  forwardPass(true);
  for (const n of orderedNodes) {
    if (n.isSummary) {
      n.es = n.s;
      n.ef = n.f;
    }
  }

  // ---- backward pass ------------------------------------------------------
  const backwardPass = (): number => {
    let projectFinish = projectStartSnapped;
    for (const n of orderedNodes) projectFinish = Math.max(projectFinish, n.f);

    for (let i = orderedNodes.length - 1; i >= 0; i--) {
      const n = orderedNodes[i]!;
      if (n.isSummary) continue;
      let lf = snapFinish(n, projectFinish);
      for (const d of n.succs) lf = Math.min(lf, allowedLateFinish(n, d));
      const cd = n.constraintDate;
      if (n.deadline !== undefined) lf = Math.min(lf, snapFinish(n, n.deadline));
      switch (n.constraint) {
        case "SNLT":
        case "MSO":
          lf = Math.min(lf, finishOf(n, snapStart(n, cd!)));
          break;
        case "FNLT":
        case "MFO":
          lf = Math.min(lf, snapFinish(n, cd!));
          break;
        default:
          break;
      }
      n.lf = lf;
      n.ls = startOf(n, lf);
    }
    // Summaries: aggregate bottom-up (deepest first).
    const summaries = orderedNodes.filter((n) => n.isSummary).sort((a, b) => b.level - a.level);
    for (const n of summaries) {
      const r = lateOf(n);
      n.ls = r.ls;
      n.lf = r.lf;
    }
    return projectFinish;
  };

  let projectFinish = backwardPass();

  // ---- ALAP: pin to late dates and re-run ----------------------------------
  const alap = orderedNodes.filter((n) => !n.isSummary && !n.pinned && n.constraint === "ALAP");
  if (alap.length > 0) {
    for (const n of alap) {
      n.s = n.ls;
      n.f = n.lf;
      n.pinned = true;
    }
    forwardPass(false);
    projectFinish = backwardPass();
  }

  // ---- slack, critical path, output -----------------------------------------
  const tasks: Record<string, ScheduledTask> = {};
  const criticalPath: string[] = [];
  for (const n of orderedNodes) {
    const totalSlack = Math.min(n.cal.workingMinutesBetween(n.es, n.ls), n.cal.workingMinutesBetween(n.ef, n.lf));
    let freeSlack = totalSlack;
    if (!n.isSummary && n.succs.length > 0) {
      freeSlack = Infinity;
      for (const d of n.succs) {
        const sNode = nodes.get(d.succ)!;
        const lc = lagCal(d);
        let allowed: number;
        switch (d.type) {
          case "FS":
            allowed = n.cal.workingMinutesBetween(n.f, lc.addMinutes(sNode.s, -d.lag));
            break;
          case "SS":
            allowed = n.cal.workingMinutesBetween(n.s, lc.addMinutes(sNode.s, -d.lag));
            break;
          case "FF":
            allowed = n.cal.workingMinutesBetween(n.f, lc.addMinutes(sNode.f, -d.lag));
            break;
          case "SF":
            allowed = n.cal.workingMinutesBetween(n.s, lc.addMinutes(sNode.f, -d.lag));
            break;
        }
        freeSlack = Math.min(freeSlack, allowed);
      }
      freeSlack = Math.min(freeSlack, totalSlack);
    }
    const isCritical = totalSlack <= criticalThreshold;
    if (totalSlack < 0) {
      warn("NEGATIVE_SLACK", n.id, `Negative total slack (${totalSlack} min): schedule conflict.`);
    }
    if (n.deadline !== undefined && n.f > n.deadline) {
      warn("DEADLINE_MISSED", n.id, `Finish ${iso(n.f)} is after deadline ${iso(n.deadline)}.`);
    }
    if (isCritical && !n.isSummary) criticalPath.push(n.id);
    tasks[n.id] = {
      id: n.id,
      name: n.name,
      parentId: n.parentId,
      children: [...n.children],
      outlineLevel: n.level,
      wbs: n.wbs,
      isSummary: n.isSummary,
      isMilestone: n.isMilestone,
      schedulingMode: n.mode,
      constraintType: n.constraint,
      calendarId: n.cal.id,
      duration: n.isSummary ? n.cal.workingMinutesBetween(n.s, n.f) : n.duration,
      start: n.s,
      finish: n.f,
      earlyStart: n.es,
      earlyFinish: n.ef,
      lateStart: n.ls,
      lateFinish: n.lf,
      totalSlack,
      freeSlack,
      isCritical,
    };
  }

  return { projectStart: projectStartSnapped, projectFinish, tasks, order, criticalPath, warnings };
}

function iso(ms: number): string {
  return new Date(ms).toISOString().slice(0, 16);
}

export type { CalendarDefinition };
