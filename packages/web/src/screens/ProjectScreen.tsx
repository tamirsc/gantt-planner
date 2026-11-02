import { useEffect, useMemo, useRef, useState } from "react";
import { GanttChart } from "../components/GanttChart";
import { MembersPanel } from "../components/MembersPanel";
import { ResourceSheet } from "../components/ResourceSheet";
import { TaskGrid } from "../components/TaskGrid";
import { Toolbar } from "../components/Toolbar";
import { t } from "../i18n";
import { makeScale } from "../lib/timeline";
import { timelineIsRtl, useStore, visibleRows } from "../store";

export function ProjectScreen({ id }: { id: string }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const [showMembers, setShowMembers] = useState(false);
  const [showResources, setShowResources] = useState(false);

  // Draggable splitter between the grid and the Gantt (vertical or horizontal depending on the layout).
  const stacked = s.prefs.layout === "stacked";
  const onSplitterDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const startW = s.prefs.gridWidth;
    const startH = s.prefs.gridHeight;
    const rtl = document.documentElement.dir === "rtl";
    const move = (ev: PointerEvent) => {
      if (stacked) {
        s.setPrefs({ gridHeight: Math.max(120, Math.min(window.innerHeight - 220, startH + (ev.clientY - startY))) });
        return;
      }
      const delta = (ev.clientX - startX) * (rtl ? -1 : 1);
      s.setPrefs({ gridWidth: Math.max(320, Math.min(window.innerWidth - 240, startW + delta)) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  useEffect(() => {
    void s.openProject(id);
    return () => s.closeProject();
  }, [id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Flush pending saves when leaving the page.
  useEffect(() => {
    const flush = () => void s.saveNow();
    window.addEventListener("beforeunload", flush);
    return () => window.removeEventListener("beforeunload", flush);
  }, [s]);

  const rows = useMemo(() => visibleRows(s.result, s.project, s.collapsed), [s.result, s.project, s.collapsed]);
  const lastDate = useMemo(() => {
    let max = s.result.projectFinish;
    for (const task of s.project.tasks) {
      if (task.deadline !== undefined) max = Math.max(max, task.deadline);
      if (task.constraintDate !== undefined) max = Math.max(max, task.constraintDate);
    }
    return max;
  }, [s.result.projectFinish, s.project.tasks]);
  const timelineRtl = timelineIsRtl(s.prefs);
  const ganttPane = useRef<HTMLDivElement>(null);
  const [paneWidth, setPaneWidth] = useState(0);
  useEffect(() => {
    const el = ganttPane.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setPaneWidth(el.clientWidth));
    ro.observe(el);
    setPaneWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [s.projectId, s.prefs.layout]);
  const scale = useMemo(
    () => makeScale(s.result.projectStart, lastDate, s.prefs.zoom, timelineRtl, paneWidth),
    [s.result.projectStart, lastDate, s.prefs.zoom, timelineRtl, paneWidth],
  );
  // Keep the project start in view: left edge for a left-to-right axis, right edge for right-to-left.
  useEffect(() => {
    const el = ganttPane.current;
    if (!el) return;
    el.scrollLeft = timelineRtl ? el.scrollWidth : 0;
  }, [timelineRtl, s.prefs.zoom, s.projectId, s.prefs.layout, paneWidth]);

  if (s.loadError) return <div className="auth-wrap">{s.loadError}</div>;
  if (s.projectId !== id) return <div className="auth-wrap">{t(lang, "loading")}</div>;

  const readOnly = !s.permissions.edit;
  const orgId = s.currentOrgId ?? "";
  return (
    <div className="app">
      <Toolbar
        readOnly={readOnly}
        onMembers={() => {
          setShowResources(false);
          setShowMembers((v) => !v);
        }}
        onResources={() => {
          setShowMembers(false);
          setShowResources((v) => !v);
        }}
      />
      <main className={"main " + (stacked ? "stacked" : "side")}>
        <div className="grid-pane" style={stacked ? { height: s.prefs.gridHeight } : { width: s.prefs.gridWidth }}>
          <TaskGrid rows={rows} readOnly={readOnly} progressOnly={readOnly && s.permissions.updateOwnTasks} />
        </div>
        <div className={"splitter " + (stacked ? "horizontal" : "vertical")} onPointerDown={onSplitterDown} />
        <div className="gantt-pane" ref={ganttPane}>
          <GanttChart rows={rows} scale={scale} readOnly={readOnly} />
        </div>
        {showMembers && <MembersPanel orgId={orgId} onClose={() => setShowMembers(false)} />}
        {showResources && <ResourceSheet readOnly={readOnly} onClose={() => setShowResources(false)} />}
      </main>
    </div>
  );
}
