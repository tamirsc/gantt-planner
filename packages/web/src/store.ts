import { create } from "zustand";
import {
  SchedulingError,
  assignResource,
  clearBaseline,
  schedule,
  setAssignmentUnits,
  takeBaseline,
  unassignResource,
  type DependencyInput,
  type ProjectInput,
  type ResourceInput,
  type ScheduleResult,
  type TaskInput,
} from "@gantt-planner/engine";
import { parseResourceNames, resolveResource, unitsFor } from "./lib/resourceText";
import { ApiError, api, type Me, type MemberRow, type ProjectDetail } from "./api";
import { RTL_LANGS, isLang, t, type Lang } from "./i18n";
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
  /** Time axis direction: "auto" follows the UI language (Hebrew → right-to-left). */
  timelineRtl: boolean | "auto";
  zoom: Zoom;
  highlightCritical: boolean;
  /** Width of the task grid pane in pixels (side-by-side layout). */
  gridWidth: number;
  /** "stacked": grid above the Gantt (default); "side": grid beside the Gantt. */
  layout: "stacked" | "side";
  /** Height of the task grid pane in pixels (stacked layout). */
  gridHeight: number;
}

export interface AppState {
  /** undefined = not checked yet, null = signed out */
  session: Me | null | undefined;
  /** Set when the server could not be reached at startup (after retries); the app shows a retry screen. */
  bootError: string | null;
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
  /** Resource Names text for a task ("Dana[50%]; Cement[10]"); unknown names create work resources. Returns false on parse error. */
  setTaskResources(taskId: string, text: string): boolean;
  addResource(partial?: Partial<ResourceInput>): string;
  updateResource(id: string, patch: Partial<ResourceInput>): void;
  deleteResource(id: string): void;
  setBaseline(index?: number): void;
  removeBaseline(index?: number): void;
  setStatusDate(ms: number | undefined): void;
  setProjectStart(ms: number): void;
  setRescheduleUncompleted(on: boolean): void;
  undo(): void;
  redo(): void;
  select(ids: string[]): void;
  toggleCollapse(id: string): void;
  setPrefs(patch: Partial<Prefs>): void;
  setToast(msg: string | null): void;
}

function loadPrefs(): Prefs {
  const defaults: Prefs = { lang: "he", timelineRtl: "auto", zoom: "week", highlightCritical: true, gridWidth: 900, layout: "stacked", gridHeight: 340 };
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    const stored = raw ? (JSON.parse(raw) as Partial<Prefs>) : {};
    // Older versions stored the axis direction as a plain boolean; the axis now follows the language.
    if (typeof stored.timelineRtl === "boolean") stored.timelineRtl = "auto";
    if (!isLang(stored.lang)) delete stored.lang;
    return { ...defaults, ...stored };
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
  /**
   * Saves run one at a time through this chain, each with the version returned by the
   * previous one. Without it, an edit made while a save was in flight produced a second
   * request with the old version, which the server rejected as a conflict.
   */
  let saveChain: Promise<void> = Promise.resolve();
  const latestVersion = new Map<string, number>();
  /** Identifies the current openProject call so a late response for an earlier project is ignored. */
  let openToken = 0;
  const scheduleSave = () => {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void get().saveNow();
    }, 800);
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
    // Undo, redo and reloads can remove tasks; never keep a selection that points at nothing.
    const ids = new Set(next.tasks.map((x) => x.id));
    const { selected, collapsed } = get();
    const keptSelection = selected.filter((id) => ids.has(id));
    set({
      selected: keptSelection.length === selected.length ? selected : keptSelection,
      collapsed: [...collapsed].every((id) => ids.has(id)) ? collapsed : new Set([...collapsed].filter((id) => ids.has(id))),
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
    latestVersion.set(p.id, p.version);
    set({ projectId: p.id, version: p.version, permissions: p.permissions, projectName: p.name });
    commit(p.data, { name: p.name, remote: true });
  };

  const applySession = (me: Me) => {
    const current = get().currentOrgId;
    const orgId = current && me.orgs.some((o) => o.id === current) ? current : (me.orgs[0]?.id ?? null);
    set({ session: me, currentOrgId: orgId, bootError: null });
    if (isLang(me.user.locale) && me.user.locale !== get().prefs.lang) get().setPrefs({ lang: me.user.locale });
  };

  const empty: ProjectInput = { start: Date.now(), tasks: [], dependencies: [] };
  const noPermissions: Permissions = { edit: false, updateOwnTasks: false, manageMembers: false, export: false, delete: false };

  return {
    session: undefined,
    bootError: null,
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
      // Only "not authenticated" means signed out. Any other failure (network, a 502 while the
      // server wakes up) is retried for about half a minute, then shown as an error with a retry button.
      set({ bootError: null });
      const delays = [1000, 2000, 4000, 8000, 15000];
      for (let attempt = 0; ; attempt++) {
        try {
          applySession(await api.me());
          return;
        } catch (e) {
          if (e instanceof ApiError && e.status === 401) {
            set({ session: null, currentOrgId: null });
            return;
          }
          const delay = delays[attempt];
          if (delay === undefined) {
            set({ bootError: (e as Error).message });
            return;
          }
          await new Promise((r) => setTimeout(r, delay));
        }
      }
    },

    async refreshSession() {
      try {
        applySession(await api.me());
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) set({ session: null, currentOrgId: null });
        else set({ toast: (e as Error).message }); // keep the current session on transient errors
      }
    },

    async signOut() {
      get().closeProject(); // flushes unsaved edits
      await saveChain;
      await api.logout();
      set({ session: null, currentOrgId: null });
    },

    setCurrentOrg(id) {
      set({ currentOrgId: id });
    },

    async openProject(id) {
      const token = ++openToken;
      // projectId stays null until the data arrives, so the screen shows "Loading…" instead of an
      // empty read-only project.
      set({ projectId: null, loadError: null, saveState: "saved", selected: [], collapsed: new Set(), past: [], future: [] });
      try {
        const p = await api.getProject(id);
        if (token !== openToken) return; // the user has moved on to another project
        applyDetail(p);
        void get().refreshMembers();
      } catch (e) {
        if (token !== openToken) return;
        set({ loadError: (e as Error).message, projectId: null });
      }
    },

    closeProject() {
      openToken++;
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = null;
      // Edits made less than a moment ago are still unsaved: queue them before forgetting the project.
      if (get().saveState === "dirty" || get().saveState === "error") void get().saveNow();
      set({ projectId: null, project: empty, projectName: "", result: schedule(empty), version: 0, permissions: noPermissions, members: [], past: [], future: [], selected: [], saveState: "saved", loadError: null });
    },

    saveNow() {
      const { projectId, project, projectName, saveState } = get();
      // "conflict" means the server's copy was just reloaded: nothing of ours to save until the next edit.
      if (!projectId || saveState === "saved" || saveState === "saving" || saveState === "conflict") return saveChain;
      // Snapshot now; the request runs after any save already in flight, with the newest version.
      const data = project;
      const name = projectName || "Project";
      set({ saveState: "saving" });
      saveChain = saveChain.then(async () => {
        const stillOpen = () => get().projectId === projectId;
        try {
          const version = latestVersion.get(projectId);
          if (version === undefined) throw new Error("Project version unknown");
          const r = await api.saveProject(projectId, { data, name, version });
          latestVersion.set(projectId, r.version);
          if (!stillOpen()) return;
          const unchanged = get().project === data && (get().projectName || "Project") === name;
          if (unchanged) {
            set({ version: r.version, saveState: "saved" });
          } else {
            // Edits made during the request: a later save is either queued ("saving") or about to be
            // scheduled ("dirty"); leave its status alone and make sure it happens.
            set({ version: r.version });
            if (get().saveState === "dirty" && !saveTimer) scheduleSave();
          }
        } catch (e) {
          if (!stillOpen()) return;
          if (e instanceof ApiError && e.status === 409) {
            // Saves are serialized, so a conflict now really means another person saved.
            const p = await api.getProject(projectId);
            applyDetail(p);
            set({ saveState: "conflict", past: [], future: [] });
          } else {
            set({ saveState: "error", toast: (e as Error).message });
          }
        }
      });
      return saveChain;
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
        const t = tasks.find((x) => x.id === id);
        if (!t) continue;
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
        const t = tasks.find((x) => x.id === id);
        if (!t || !t.parentId) continue;
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

    setTaskResources(taskId, text) {
      const refs = parseResourceNames(text);
      if (!refs) return false;
      let p = get().project;
      const resources = [...(p.resources ?? [])];
      const wanted = new Map<string, ReturnType<typeof unitsFor>>();
      for (const ref of refs) {
        const { resource, created } = resolveResource(resources, ref.name, newId);
        if (created) resources.push(resource);
        wanted.set(resource.id, unitsFor(ref, resource));
      }
      p = { ...p, resources };
      // Remove assignments that were dropped, update units of kept ones, add the new ones.
      for (const a of (p.assignments ?? []).filter((a) => a.taskId === taskId)) {
        if (!wanted.has(a.resourceId)) p = unassignResource(p, taskId, a.resourceId);
      }
      for (const [resourceId, u] of wanted) {
        const existing = (p.assignments ?? []).find((a) => a.taskId === taskId && a.resourceId === resourceId);
        const resource = resources.find((r) => r.id === resourceId)!;
        if (!existing) {
          p = assignResource(p, taskId, resourceId, u.units ?? 1);
          const cost = u.cost;
          if (cost !== undefined) p = { ...p, assignments: (p.assignments ?? []).map((a) => (a.taskId === taskId && a.resourceId === resourceId ? { ...a, cost } : a)) };
        } else if ((resource.type ?? "work") === "work" && u.units !== undefined && u.units !== (existing.units ?? 1)) {
          p = setAssignmentUnits(p, taskId, resourceId, u.units);
        } else if ((resource.type ?? "work") !== "work") {
          p = { ...p, assignments: (p.assignments ?? []).map((a) => (a === existing ? { ...a, ...u } : a)) };
        }
      }
      return commit(p);
    },

    addResource(partial = {}) {
      const p = get().project;
      const id = partial.id ?? newId();
      const resource: ResourceInput = { ...partial, id, name: partial.name ?? "" };
      commit({ ...p, resources: [...(p.resources ?? []), resource] });
      return id;
    },

    updateResource(id, patch) {
      const p = get().project;
      const resources = (p.resources ?? []).map((r) => {
        if (r.id !== id) return r;
        const next: ResourceInput = { ...r, ...patch };
        for (const k of Object.keys(next) as (keyof ResourceInput)[]) if (next[k] === undefined) delete next[k];
        return next;
      });
      commit({ ...p, resources });
    },

    deleteResource(id) {
      const p = get().project;
      commit({
        ...p,
        resources: (p.resources ?? []).filter((r) => r.id !== id),
        assignments: (p.assignments ?? []).filter((a) => a.resourceId !== id),
      });
    },

    setBaseline(index = 0) {
      const { project, result } = get();
      commit(takeBaseline(project, result, index));
    },

    removeBaseline(index = 0) {
      commit(clearBaseline(get().project, index));
    },

    setStatusDate(ms) {
      const p = { ...get().project };
      if (ms === undefined) delete p.statusDate;
      else p.statusDate = ms;
      commit(p);
    },

    setProjectStart(ms) {
      commit({ ...get().project, start: ms });
    },

    setRescheduleUncompleted(on) {
      const p = get().project;
      commit({ ...p, options: { ...(p.options ?? {}), rescheduleUncompletedWork: on } });
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
      // Switching language resets the axis direction to that language's default.
      const reset = patch.lang !== undefined && patch.lang !== get().prefs.lang ? { timelineRtl: "auto" as const } : {};
      const prefs = { ...get().prefs, ...reset, ...patch };
      set({ prefs });
      // The UI language is part of the account, so it follows the user to other devices.
      if (patch.lang !== undefined && get().session && get().session!.user.locale !== patch.lang) {
        const lang = patch.lang;
        api.updateMe({ locale: lang }).then(
          (r) => set((st) => (st.session ? { session: { ...st.session, user: r.user } } : {})),
          () => undefined,
        );
      }
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

/** Effective time-axis direction for the current preferences. */
export function timelineIsRtl(prefs: Prefs): boolean {
  return prefs.timelineRtl === "auto" ? RTL_LANGS.has(prefs.lang) : prefs.timelineRtl;
}

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
