import { create } from "zustand";
import {
  SchedulingError,
  schedule,
  type DependencyInput,
  type ProjectInput,
  type ScheduleResult,
  type TaskInput,
} from "@gantt-planner/engine";
import { ApiError, api, type Me, type MemberRow, type ProjectDetail } from "./api";
import { t, type Lang } from "./i18n";
import type { Zoom } from "./lib/timeline";

const PREFS_KEY = "gantt-planner.prefs.v1";

/** Application-level task fields the engine ignores. */
export interface AppTaskExtras {
  assigneeId?: string;
  notes?: string;
}
export type AppTask = TaskInput & AppTaskExtras;

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict";

export interface Permissions {
  edit: boolean;
  updateOwnTasks: boolean;
  manageMembers: boolean;
  export: boolean;
  delete: boolean;
}

interface Prefs {
  lang: Lang;
  timelineRtl: boolean;
  zoom: Zoom;
  highlightCritical: boolean;
}

export interface AppState {
  /** undefined = not checked yet, null = signed out */
  session: Me | null | undefined;
  currentOrgId: string | null;

  /** Loaded project (server-backed). */
  projectId: string | null;
  version: number;
  permissions: Permissions;
  members: MemberRow[];
  saveState: SaveState;
  loadError: string | null;

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

  // session
  bootstrap(): Promise<void>;
  refreshSession(): Promise<void>;
  signOut(): Promise<void>;
  setCurrentOrg(id: string): void;

  // project lifecycle
  openProject(id: string): Promise<void>;
  closeProject(): void;
  saveNow(): Promise<void>;
  setProjectName(name: string): void;
  refreshMembers(): Promise<void>;

  // mutations (all go through commit → history + reschedule + autosave)
  setProject(project: ProjectInput, name?: string): void;
  updateTask(id: string, patch: Partial<AppTask>): void;
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

function loadPrefs(): Prefs {
  const defaults: Prefs = { lang: "he", timelineRtl: false, zoom: "week", highlightCritical: true };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<Prefs>) } : defaults;
  } catch {
    return defaults;
  }
}

let seq = Date.now();
export function newId(): string {
  return `t${(seq++).toString(36)}`;
}

export const useStore = create<AppState>((set, get) => {
  /** Apply a project change: validate by scheduling, push history, persist. Returns false on scheduling error. */
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void get().saveNow(), 800);
  };

  const commit = (next: ProjectInput, opts: { name?: string; history?: boolean; remote?: boolean } = {}): boolean => {
    const { project, past, projectName, permissions } = get();
    if (!opts.remote && !permissions.edit && !permissions.updateOwnTasks) {
      set({ toast: permissions.updateOwnTasks ? t(get().prefs.lang, "progressOnly") : t(get().prefs.lang, "readOnly") });
      return false;
    }
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
      past: opts.remote || opts.history === false ? past : [...past.slice(-99), project],
      future: opts.remote || opts.history === false ? get().future : [],
      saveState: opts.remote ? "saved" : "dirty",
    });
    if (!opts.remote) scheduleSave();
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

  const applyDetail = (p: ProjectDetail) => {
    set({ projectId: p.id, version: p.version, permissions: p.permissions, projectName: p.name });
    commit(p.data, { name: p.name, remote: true });
  };

  const empty: ProjectInput = { start: Date.now(), tasks: [], dependencies: [] };
  const noPermissions: Permissions = { edit: false, updateOwnTasks: false, manageMembers: false, export: false, delete: false };

  return {
    session: undefined,
    currentOrgId: null,
    projectId: null,
    version: 0,
    permissions: noPermissions,
    members: [],
    saveState: "saved",
    loadError: null,
    project: empty,
    projectName: "",
    result: schedule(empty),
    error: null,
    past: [],
    future: [],
    selected: [],
    collapsed: new Set(),
    prefs: loadPrefs(),
    toast: null,

    async bootstrap() {
      await get().refreshSession();
    },

    async refreshSession() {
      try {
        const me = await api.me();
        const current = get().currentOrgId;
        const orgId = current && me.orgs.some((o) => o.id === current) ? current : (me.orgs[0]?.id ?? null);
        set({ session: me, currentOrgId: orgId });
        if (me.user.locale === "he" || me.user.locale === "en") get().setPrefs({ lang: me.user.locale });
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) set({ session: null, currentOrgId: null });
        else set({ session: null, toast: (e as Error).message });
      }
    },

    async signOut() {
      await api.logout();
      get().closeProject();
      set({ session: null, currentOrgId: null });
    },

    setCurrentOrg(id) {
      set({ currentOrgId: id });
    },

    async openProject(id) {
      set({ projectId: id, loadError: null, saveState: "saved", selected: [], collapsed: new Set(), past: [], future: [] });
      try {
        const p = await api.getProject(id);
        applyDetail(p);
        void get().refreshMembers();
      } catch (e) {
        set({ loadError: (e as Error).message, projectId: null });
      }
    },

    closeProject() {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      set({ projectId: null, project: empty, projectName: "", result: schedule(empty), version: 0, permissions: noPermissions, members: [], past: [], future: [], selected: [], saveState: "saved" });
    },

    async saveNow() {
      const { projectId, project, projectName, version, saveState } = get();
      if (!projectId || saveState === "saved" || saveState === "saving") return;
      set({ saveState: "saving" });
      try {
        const r = await api.saveProject(projectId, { data: project, name: projectName || "Project", version });
        set({ version: r.version, saveState: get().saveState === "saving" ? "saved" : get().saveState });
      } catch (e) {
        if (e instanceof ApiError && e.status === 409) {
          const p = await api.getProject(projectId);
          applyDetail(p);
          set({ saveState: "conflict", past: [], future: [] });
        } else {
          set({ saveState: "error", toast: (e as Error).message });
        }
      }
    },

    setProjectName(name) {
      set({ projectName: name, saveState: "dirty" });
      scheduleSave();
    },

    async refreshMembers() {
      const id = get().projectId;
      if (!id) return;
      try {
        set({ members: await api.projectMembers(id) });
      } catch {
        /* viewers without access to the list keep an empty list */
      }
    },

    setProject(project, name) {
      commit(project, name === undefined ? {} : { name });
      set({ selected: [], collapsed: new Set() });
    },

    updateTask(id, patch) {
      const p = get().project;
      const tasks = p.tasks.map((t) => {
        if (t.id !== id) return t;
        const next: AppTask = { ...t, ...patch };
        // Remove keys explicitly set to undefined so exactOptionalPropertyTypes stays honest.
        for (const k of Object.keys(next) as (keyof AppTask)[]) if (next[k] === undefined) delete next[k];
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
