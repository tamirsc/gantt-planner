import { useEffect, useMemo, useRef } from "react";
import { GanttChart } from "./components/GanttChart";
import { TaskGrid } from "./components/TaskGrid";
import { Toolbar } from "./components/Toolbar";
import { makeScale } from "./lib/timeline";
import { useStore, visibleRows } from "./store";

export function App() {
  const s = useStore();
  const lang = s.prefs.lang;

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    if (!s.toast) return;
    const h = setTimeout(() => s.setToast(null), 5000);
    return () => clearTimeout(h);
  }, [s.toast, s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if (e.key === "Delete" && s.selected.length > 0) {
        s.deleteTasks(s.selected);
      } else if (e.key === "Insert") {
        s.addTask(s.selected[s.selected.length - 1] ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  const rows = useMemo(() => visibleRows(s.result, s.project, s.collapsed), [s.result, s.project, s.collapsed]);
  const lastDate = useMemo(() => {
    let max = s.result.projectFinish;
    for (const t of s.project.tasks) {
      if (t.deadline !== undefined) max = Math.max(max, t.deadline);
      if (t.constraintDate !== undefined) max = Math.max(max, t.constraintDate);
    }
    return max;
  }, [s.result.projectFinish, s.project.tasks]);
  const scale = useMemo(
    () => makeScale(s.result.projectStart, lastDate, s.prefs.zoom, s.prefs.timelineRtl),
    [s.result.projectStart, lastDate, s.prefs.zoom, s.prefs.timelineRtl],
  );

  // Keep the project start in view: at the left edge for LTR timelines, at the right edge for RTL ones.
  const ganttPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ganttPane.current;
    if (!el) return;
    el.scrollLeft = s.prefs.timelineRtl ? el.scrollWidth : 0;
  }, [s.prefs.timelineRtl, s.prefs.zoom]);

  return (
    <div className="app">
      <Toolbar />
      <main className="main">
        <div className="grid-pane">
          <TaskGrid rows={rows} />
        </div>
        <div className="gantt-pane" ref={ganttPane}>
          <GanttChart rows={rows} scale={scale} />
        </div>
      </main>
      {s.toast && (
        <div className="toast" dir="auto" onClick={() => s.setToast(null)}>
          {s.toast}
        </div>
      )}
    </div>
  );
}
