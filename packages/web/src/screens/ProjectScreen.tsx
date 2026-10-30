import { useEffect, useMemo, useRef, useState } from "react";
import { GanttChart } from "../components/GanttChart";
import { MembersPanel } from "../components/MembersPanel";
import { ResourceSheet } from "../components/ResourceSheet";
import { TaskGrid } from "../components/TaskGrid";
import { Toolbar } from "../components/Toolbar";
import { t } from "../i18n";
import { makeScale } from "../lib/timeline";
import { useStore, visibleRows } from "../store";

export function ProjectScreen({ id }: { id: string }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const [showMembers, setShowMembers] = useState(false);
  const [showResources, setShowResources] = useState(false);

  // Draggable splitter between the grid and the Gantt.
  const onSplitterDown = (e: React.PointerEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = s.prefs.gridWidth;
    const rtl = document.documentElement.dir === "rtl";
    const move = (ev: PointerEvent) => {
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
  const scale = useMemo(
    () => makeScale(s.result.projectStart, lastDate, s.prefs.zoom, s.prefs.timelineRtl),
    [s.result.projectStart, lastDate, s.prefs.zoom, s.prefs.timelineRtl],
  );
  const ganttPane = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ganttPane.current;
    if (!el) return;
    el.scrollLeft = s.prefs.timelineRtl ? el.scrollWidth : 0;
  }, [s.prefs.timelineRtl, s.prefs.zoom, s.projectId]);

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
      <main className="main">
        <div className="grid-pane" style={{ width: s.prefs.gridWidth }}>
          <TaskGrid rows={rows} readOnly={readOnly} progressOnly={readOnly && s.permissions.updateOwnTasks} />
        </div>
        <div className="splitter" onPointerDown={onSplitterDown} />
        <div className="gantt-pane" ref={ganttPane}>
          <GanttChart rows={rows} scale={scale} readOnly={readOnly} />
        </div>
        {showMembers && <MembersPanel orgId={orgId} onClose={() => setShowMembers(false)} />}
        {showResources && <ResourceSheet readOnly={readOnly} onClose={() => setShowResources(false)} />}
      </main>
    </div>
  );
}
