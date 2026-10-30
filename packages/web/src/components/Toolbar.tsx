import { useRef } from "react";
import { readMspdi, writeMspdi } from "@gantt-planner/mspdi";
import { t } from "../i18n";
import { fmtDate } from "../lib/format";
import { dayStart, utc } from "@gantt-planner/engine";
import type { Zoom } from "../lib/timeline";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";
import { api } from "../api";
import { UserMenu } from "./UserMenu";

export function Toolbar({ readOnly, onMembers, onResources }: { readOnly: boolean; onMembers: () => void; onResources: () => void }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    try {
      const xml = await file.text();
      const doc = readMspdi(xml);
      s.setProject(doc.project, doc.name || s.projectName);
      if (doc.warnings.length > 0) s.setToast(doc.warnings.map((w) => w.message).join("\n"));
    } catch (e) {
      s.setToast(`${t(lang, "importError")} ${(e as Error).message}`);
    }
  };

  const onExport = () => {
    const xml = writeMspdi(s.project, { name: s.projectName || "Project", result: s.result });
    const blob = new Blob([xml], { type: "application/xml" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${s.projectName || "project"}.xml`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const onDelete = async () => {
    if (!s.projectId || !confirm(t(lang, "confirmDelete"))) return;
    try {
      await api.deleteProject(s.projectId);
      navigate(pathFor.projects(), true);
    } catch (e) {
      s.setToast((e as Error).message);
    }
  };

  const sel = s.selected;
  const warnings = s.result.warnings.length;
  const hasBaseline = (s.project.baselines ?? []).some((b) => b.index === 0);
  const ev = s.result.earnedValue;
  const saveLabel = { saved: t(lang, "saved"), dirty: t(lang, "unsaved"), saving: t(lang, "saving"), error: t(lang, "saveError"), conflict: t(lang, "conflict") }[s.saveState];

  return (
    <header className="toolbar">
      <div className="brand">
        <button onClick={() => navigate(pathFor.projects())} title={t(lang, "back")}>
          ←
        </button>
        <input
          className="project-name"
          dir="auto"
          placeholder={t(lang, "newProjectName")}
          value={s.projectName}
          disabled={readOnly}
          onChange={(e) => s.setProjectName(e.target.value)}
        />
        <span className={`save-state ${s.saveState}`} title={saveLabel}>
          {readOnly ? t(lang, "readOnly") : saveLabel}
        </span>
      </div>

      {!readOnly && (
        <div className="group">
          <button onClick={() => s.addTask(sel[sel.length - 1] ?? null)}>{t(lang, "addTask")}</button>
          <button disabled={sel.length === 0} onClick={() => s.deleteTasks(sel)}>
            {t(lang, "deleteTask")}
          </button>
          <button disabled={sel.length === 0} onClick={() => s.indent(sel)}>
            {t(lang, "indent")}
          </button>
          <button disabled={sel.length === 0} onClick={() => s.outdent(sel)}>
            {t(lang, "outdent")}
          </button>
          <button disabled={sel.length < 2} onClick={() => s.linkTasks(sel)}>
            {t(lang, "link")}
          </button>
          <button disabled={s.past.length === 0} onClick={s.undo} title="Ctrl+Z">
            {t(lang, "undo")}
          </button>
          <button disabled={s.future.length === 0} onClick={s.redo} title="Ctrl+Y">
            {t(lang, "redo")}
          </button>
        </div>
      )}

      <div className="group">
        {!readOnly && <button onClick={() => fileRef.current?.click()}>{t(lang, "importXml")}</button>}
        <input
          ref={fileRef}
          type="file"
          accept=".xml,text/xml,application/xml"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void onImport(f);
            e.target.value = "";
          }}
        />
        {s.permissions.export && <button onClick={onExport}>{t(lang, "exportXml")}</button>}
        <button onClick={onResources}>{t(lang, "resources")}</button>
        <button onClick={onMembers}>{t(lang, "members")}</button>
        {s.permissions.delete && <button onClick={() => void onDelete()}>{t(lang, "deleteProject")}</button>}
      </div>

      {!readOnly && (
        <div className="group">
          {hasBaseline ? (
            <button onClick={() => s.removeBaseline(0)} title={t(lang, "clearBaselineBtn")}>
              {t(lang, "clearBaselineBtn")}
            </button>
          ) : (
            <button onClick={() => s.setBaseline(0)}>{t(lang, "setBaseline")}</button>
          )}
          <label className="check" title={t(lang, "statusDate")}>
            {t(lang, "statusDate")}
            <input
              type="date"
              value={s.project.statusDate !== undefined ? new Date(dayStart(s.project.statusDate)).toISOString().slice(0, 10) : ""}
              onChange={(e) => s.setStatusDate(e.target.value ? utc(e.target.value) : undefined)}
            />
          </label>
          {s.project.statusDate !== undefined && (
            <label className="check" title={t(lang, "rescheduleRemaining")}>
              <input type="checkbox" checked={s.project.options?.rescheduleUncompletedWork ?? false} onChange={(e) => s.setRescheduleUncompleted(e.target.checked)} />
              ⇥
            </label>
          )}
        </div>
      )}

      <div className="group">
        <select value={s.prefs.zoom} onChange={(e) => s.setPrefs({ zoom: e.target.value as Zoom })}>
          <option value="day">{t(lang, "zoomDay")}</option>
          <option value="week">{t(lang, "zoomWeek")}</option>
          <option value="month">{t(lang, "zoomMonth")}</option>
        </select>
        <label className="check">
          <input type="checkbox" checked={s.prefs.highlightCritical} onChange={(e) => s.setPrefs({ highlightCritical: e.target.checked })} />
          {t(lang, "showCritical")}
        </label>
        <label className="check" title={t(lang, "timelineDir")}>
          <input type="checkbox" checked={s.prefs.timelineRtl} onChange={(e) => s.setPrefs({ timelineRtl: e.target.checked })} />
          RTL ⟵
        </label>
      </div>

      <div className="status" dir="auto">
        <span>
          {t(lang, "projectStart")}: <b>{fmtDate(lang, s.result.projectStart)}</b>
        </span>
        <span>
          {t(lang, "projectFinish")}: <b>{fmtDate(lang, s.result.projectFinish)}</b>
        </span>
        <span>
          {s.project.tasks.length} {t(lang, "tasks")}
        </span>
        <span>
          {s.result.criticalPath.length} {t(lang, "critical")}
        </span>
        {s.result.percentComplete > 0 && <span>{Math.round(s.result.percentComplete)}%</span>}
        {s.result.cost > 0 && (
          <span>
            {t(lang, "colCost")}: <b dir="ltr">{Math.round(s.result.cost).toLocaleString()}</b>
          </span>
        )}
        {ev && ev.spi !== null && (
          <span className={ev.spi < 0.95 ? "warn" : ""} title={`${t(lang, "earnedValue")}: PV ${Math.round(ev.pv)} · EV ${Math.round(ev.ev)} · AC ${Math.round(ev.ac)}`} dir="ltr">
            SPI {ev.spi.toFixed(2)}{ev.cpi !== null ? ` · CPI ${ev.cpi.toFixed(2)}` : ""}
          </span>
        )}
        {warnings > 0 && (
          <span className="warn" title={s.result.warnings.map((w) => w.message).join("\n")}>
            ⚠ {warnings} {t(lang, "warnings")}
          </span>
        )}
      </div>
      <UserMenu />
    </header>
  );
}
