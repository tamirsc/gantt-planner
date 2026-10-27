import { useRef } from "react";
import { readMspdi, writeMspdi } from "@gantt-planner/mspdi";
import { t } from "../i18n";
import { fmtDate } from "../lib/format";
import type { Zoom } from "../lib/timeline";
import { useStore } from "../store";
import { sampleProject } from "../sample";

export function Toolbar() {
  const s = useStore();
  const lang = s.prefs.lang;
  const fileRef = useRef<HTMLInputElement>(null);

  const onImport = async (file: File) => {
    try {
      const xml = await file.text();
      const doc = readMspdi(xml);
      s.setProject(doc.project, doc.name || file.name.replace(/\.xml$/i, ""));
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

  const sel = s.selected;
  const warnings = s.result.warnings.length;

  return (
    <header className="toolbar">
      <div className="brand">
        <strong>{t(lang, "appTitle")}</strong>
        <input
          className="project-name"
          dir="auto"
          placeholder={t(lang, "sample")}
          value={s.projectName}
          onChange={(e) => useStore.setState({ projectName: e.target.value })}
        />
      </div>

      <div className="group">
        <button onClick={() => s.setProject(sampleProject(), "")} title={t(lang, "newProject")}>
          {t(lang, "newProject")}
        </button>
        <button onClick={() => fileRef.current?.click()}>{t(lang, "importXml")}</button>
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
        <button onClick={onExport}>{t(lang, "exportXml")}</button>
      </div>

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
        <button onClick={() => s.setPrefs({ lang: lang === "he" ? "en" : "he" })}>{t(lang, "language")}</button>
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
        {warnings > 0 && (
          <span className="warn" title={s.result.warnings.map((w) => w.message).join("\n")}>
            ⚠ {warnings} {t(lang, "warnings")}
          </span>
        )}
      </div>
    </header>
  );
}
