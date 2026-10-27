import { create } from "zustand";
import {
  SchedulingError,
  schedule,
  type DependencyInput,
  type ProjectInput,
  type ScheduleResult,
  type TaskInput,
} from "@gantt-planner/engine";
import type { Lang } from "./i18n";
import type { Zoom } from "./lib/timeline";
import { sampleProject } from "./sample";

const STORAGE_KEY = "gantt-planner.project.v1";
const PREFS_KEY = "gantt-planner.prefs.v1";

interface Prefs {
  lang: Lang;
  timelineRtl: boolean;
  zoom: Zoom;
  highlightCritical: boolean;
}

export interface AppState {
  project: ProjectInput;
  projectName: string;
  result: ScheduleResult;
  error: string | null;
  past: ProjectInput[];
  future: ProjectInput[];
  selected: string[];
  collapsed: Set<string>;
  prefs: Prefs;
  toast: string | null;

  // mutations (all go through commit → history + reschedule)
  setProject(project: ProjectInput, name?: string): void;
  updateTask(id: string, patch: Partial<TaskInput>): void;
  addTask(afterId: string | null): string;
  deleteTasks(ids: string[]): void;
  indent(ids: string[]): void;
  outdent(ids: string[]): void;
  setPredecessors(id: string, deps: DependencyInput[]): boolean;
  linkTasks(ids: string[]): boolean;
  addDependency(dep: DependencyInput): boolean;
  moveTask(id: string, newStartDay: number): void;
  resizeTask(id: string, duration: number): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  toggleCollapse(id: string): void;
  setPrefs(patch: Partial<Prefs>): void;
  setToast(msg: string | null): void;
}

function loadProject(): { project: ProjectInput; name: string } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { project: ProjectInput; name: string };
      if (parsed.project?.tasks) return parsed;
    }
  } catch {
    /* ignore */
  }
  return { project: sampleProject(), name: "" };
}

function loadPrefs(): Prefs {
  const defaults: Prefs = { lang: "he", timelineRtl: false, zoom: "week", highlightCritical: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
  } catch {
    return defaults;
  }
}

function persist(project: ProjectInput, name: string) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ project, name }));
  } catch {
    /* ignore */
  }
}

let seq = Date.now();
export function newId(): string {
  return `t${(seq++).toString(36)}`;
}

const initial = loadProject();

export const useStore = create<AppState>((set, get) => {
  /** Apply a project change: validate by scheduling, push history, persist. Returns false on scheduling error. */
  const commit = (next: ProjectInput, opts: { name?: string; history?: boolean } = {}): boolean => {
    const { project, past, projectName } = get();
    let result: ScheduleResult;
    try {
      result = schedule(next);
    } catch (e) {
      if (e instanceof SchedulingError) {
        // Report cycles with task names rather than internal ids.
        const cycle = (e.details as { cycle?: string[] } | undefined)?.cycle;
        const nameOf = (id: string) => next.tasks.find((t) => t.id === id)?.name || id;
        set({ toast: cycle ? `${e.message.split(":")[0]}: ${cycle.map(nameOf).join(" → ")}` : e.message });
        return false;
      }
      throw e;
    }
    const name = opts.name ?? projectName;
    set({
      project: next,
      projectName: name,
      result,
      error: null,
      past: opts.history === false ? past : [...past.slice(-99), project],
      future: opts.history === false ? get().future : [],
    });
    persist(next, name);
    return true;
  };

  const outlineOrder = (p: ProjectInput): string[] => {
    const byParent = new Map<string | null, TaskInput[]>();
    for (const t of p.tasks) {
      const k = t.parentId ?? null;
      (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(t);
    }
    const out: string[] = [];
    const visit = (parent: string | null) => {
      for (const t of byParent.get(parent) ?? []) {
        out.push(t.id);
        visit(t.id);
      }
    };
    visit(null);
    return out;
  };

  const descendants = (p: ProjectInput, id: string): Set<string> => {
    const out = new Set<string>();
    const walk = (x: string) => {
      for (const t of p.tasks) if (t.parentId === x && !out.has(t.id)) (out.add(t.id), walk(t.id));
    };
    walk(id);
    return out;
  };

  return {
    project: initial.project,
    projectName: initial.name,
    result: schedule(initial.project),
    error: null,
    past: [],
    future: [],
    selected: [],
    collapsed: new Set(),
    prefs: loadPrefs(),
    toast: null,

    setProject(project, name) {
      commit(project, { name: name ?? "" });
      set({ selected: [], collapsed: new Set() });
    },

    updateTask(id, patch) {
      const p = get().project;
      const tasks = p.tasks.map((t) => {
        if (t.id !== id) return t;
        const next: TaskInput = { ...t, ...patch };
        // Remove keys explicitly set to undefined so exactOptionalPropertyTypes stays honest.
        for (const k of Object.keys(next) as (keyof TaskInput)[]) if (next[k] === undefined) delete next[k];
        return next;
      });
      commit({ ...p, tasks });
    },

    addTask(afterId) {
      const p = get().project;
      const id = newId();
      const after = afterId ? p.tasks.find((t) => t.id === afterId) : undefined;
      const task: TaskInput = { id, name: "", duration: 480 };
      if (after?.parentId) task.parentId = after.parentId;
      const tasks = [...p.tasks];
      if (after) {
        // Insert after the task and all its descendants (in input order).
        const desc = descendants(p, after.id);
        let idx = tasks.findIndex((t) => t.id === after.id);
        while (idx + 1 < tasks.length && desc.has(tasks[idx + 1]!.id)) idx++;
        tasks.splice(idx + 1, 0, task);
      } else tasks.push(task);
      commit({ ...p, tasks });
      set({ selected: [id] });
      return id;
    },

    deleteTasks(ids) {
      const p = get().project;
      const gone = new Set<string>();
      for (const id of ids) {
        gone.add(id);
        for (const d of descendants(p, id)) gone.add(d);
      }
      const tasks = p.tasks.filter((t) => !gone.has(t.id));
      const dependencies = (p.dependencies ?? []).filter((d) => !gone.has(d.predecessorId) && !gone.has(d.successorId));
      commit({ ...p, tasks, dependencies });
      set({ selected: [] });
    },

    indent(ids) {
      const p = get().project;
      const order = outlineOrder(p);
      let tasks = p.tasks;
      for (const id of ids) {
        const t = tasks.find((x) => x.id === id)!;
        // New parent = previous sibling (same parent) in outline order.
        const idx = order.indexOf(id);
        let prevSibling: TaskInput | undefined;
        for (let i = idx - 1; i >= 0; i--) {
          const c = tasks.find((x) => x.id === order[i])!;
          if ((c.parentId ?? null) === (t.parentId ?? null)) {
            prevSibling = c;
            break;
          }
          if (c.id === t.parentId) break;
        }
        if (!prevSibling || ids.includes(prevSibling.id)) continue;
        const parent = prevSibling;
        tasks = tasks.map((x) => (x.id === id ? { ...x, parentId: parent.id } : x));
      }
      commit({ ...p, tasks });
    },

    outdent(ids) {
      const p = get().project;
      let tasks = p.tasks;
      for (const id of ids) {
        const t = tasks.find((x) => x.id === id)!;
        if (!t.parentId) continue;
        const parent = tasks.find((x) => x.id === t.parentId)!;
        // Following siblings become children of the outdented task (MS Project behaviour).
        const siblings = tasks.filter((x) => (x.parentId ?? null) === (parent.id ?? null));
        const myIdx = siblings.findIndex((x) => x.id === id);
        const following = new Set(siblings.slice(myIdx + 1).map((x) => x.id));
        tasks = tasks.map((x) => {
          if (x.id === id) {
            const next = { ...x };
            if (parent.parentId) next.parentId = parent.parentId;
            else delete next.parentId;
            return next;
          }
          if (following.has(x.id)) return { ...x, parentId: id };
          return x;
        });
      }
      commit({ ...p, tasks });
    },

    setPredecessors(id, deps) {
      const p = get().project;
      const dependencies = [...(p.dependencies ?? []).filter((d) => d.successorId !== id), ...deps];
      return commit({ ...p, dependencies });
    },

    linkTasks(ids) {
      const p = get().project;
      const order = outlineOrder(p);
      const sorted = [...ids].sort((a, b) => order.indexOf(a) - order.indexOf(b));
      const deps = [...(p.dependencies ?? [])];
      for (let i = 1; i < sorted.length; i++) {
        const pred = sorted[i - 1]!;
        const succ = sorted[i]!;
        if (!deps.some((d) => d.predecessorId === pred && d.successorId === succ)) {
          deps.push({ predecessorId: pred, successorId: succ, type: "FS", lag: 0 });
        }
      }
      return commit({ ...p, dependencies: deps });
    },

    addDependency(dep) {
      const p = get().project;
      const deps = p.dependencies ?? [];
      if (deps.some((d) => d.predecessorId === dep.predecessorId && d.successorId === dep.successorId)) return true;
      return commit({ ...p, dependencies: [...deps, dep] });
    },

    moveTask(id, newStartDay) {
      // Dragging an auto-scheduled bar sets a Start No Earlier Than constraint, as MS Project does.
      const p = get().project;
      const tasks = p.tasks.map((t) =>
        t.id === id && t.schedulingMode !== "manual"
          ? { ...t, constraintType: "SNET" as const, constraintDate: newStartDay }
          : t.id === id
            ? { ...t, start: newStartDay }
            : t,
      );
      commit({ ...p, tasks });
    },

    resizeTask(id, duration) {
      const p = get().project;
      const tasks = p.tasks.map((t) => (t.id === id ? { ...t, duration: Math.max(0, duration) } : t));
      commit({ ...p, tasks });
    },

    undo() {
      const { past, project, future } = get();
      const prev = past[past.length - 1];
      if (!prev) return;
      set({ past: past.slice(0, -1), future: [project, ...future] });
      commit(prev, { history: false });
    },

    redo() {
      const { future, project, past } = get();
      const next = future[0];
      if (!next) return;
      set({ future: future.slice(1), past: [...past, project] });
      commit(next, { history: false });
    },

    select(ids) {
      set({ selected: ids });
    },

    toggleCollapse(id) {
      const c = new Set(get().collapsed);
      if (c.has(id)) c.delete(id);
      else c.add(id);
      set({ collapsed: c });
    },

    setPrefs(patch) {
      const prefs = { ...get().prefs, ...patch };
      set({ prefs });
      try {
        localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
      } catch {
        /* ignore */
      }
    },

    setToast(msg) {
      set({ toast: msg });
    },
  };
});

/** Visible rows in outline order, honouring collapsed summaries. */
export function visibleRows(result: ScheduleResult, project: ProjectInput, collapsed: Set<string>): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const t of project.tasks) {
    const k = t.parentId ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(t.id);
  }
  const out: string[] = [];
  const visit = (parent: string | null) => {
    for (const id of byParent.get(parent) ?? []) {
      if (!result.tasks[id]) continue;
      out.push(id);
      if (!collapsed.has(id)) visit(id);
    }
  };
  visit(null);
  return out;
}

/** All rows in outline order (for MS Project style row numbers). */
export function allRows(project: ProjectInput): string[] {
  const byParent = new Map<string | null, string[]>();
  for (const t of project.tasks) {
    const k = t.parentId ?? null;
    (byParent.get(k) ?? byParent.set(k, []).get(k)!).push(t.id);
  }
  const out: string[] = [];
  const visit = (parent: string | null) => {
    for (const id of byParent.get(parent) ?? []) {
      out.push(id);
      visit(id);
    }
  };
  visit(null);
  return out;
}
