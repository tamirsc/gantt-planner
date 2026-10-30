import { useState } from "react";
import type { ResourceInput, ResourceType } from "@gantt-planner/engine";
import { israelStandard, standardMonFri, twentyFourHours } from "@gantt-planner/engine";
import { t } from "../i18n";
import { calendarFor, projectCalendarId } from "../lib/calendars";
import { fmtDuration } from "../lib/format";
import { useStore } from "../store";

/** Resource sheet: the project's resources with their rates, calendars, work, cost and overallocation. */
export function ResourceSheet({ readOnly, onClose }: { readOnly: boolean; onClose: () => void }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const resources = s.project.resources ?? [];
  const minutesPerDay = calendarFor(s.project).minutesPerDay;
  const projectCalId = projectCalendarId(s.project);
  const calendarOptions = [
    ...(s.project.calendars ?? []),
    ...[israelStandard, standardMonFri, twentyFourHours].filter((c) => !(s.project.calendars ?? []).some((x) => x.id === c.id)),
  ];
  const [newName, setNewName] = useState("");

  const add = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    s.addResource({ name: newName.trim() });
    setNewName("");
  };

  return (
    <div className="panel wide">
      <div className="panel-head">
        <h3>{t(lang, "resources")}</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <table className="list resources">
        <thead>
          <tr>
            <th>{t(lang, "resName")}</th>
            <th>{t(lang, "resType")}</th>
            <th>{t(lang, "resMaxUnits")}</th>
            <th>{t(lang, "resRate")}</th>
            <th>{t(lang, "resCalendar")}</th>
            <th>{t(lang, "resWork")}</th>
            <th>{t(lang, "resCost")}</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {resources.map((r) => {
            const usage = s.result.resources[r.id];
            const type: ResourceType = r.type ?? "work";
            return (
              <tr key={r.id} className={usage?.isOverallocated ? "overallocated" : ""}>
                <td>
                  <input
                    dir="auto"
                    value={r.name ?? ""}
                    disabled={readOnly}
                    onChange={(e) => s.updateResource(r.id, { name: e.target.value })}
                    title={usage?.isOverallocated ? `${usage.overallocatedDays.length} ${t(lang, "resOverallocatedDays")}` : ""}
                  />
                  {usage?.isOverallocated && <span className="badge-warn" title={`${usage.overallocatedDays.length} ${t(lang, "resOverallocatedDays")}`}>⚠ {t(lang, "resOverallocated")}</span>}
                </td>
                <td>
                  <select value={type} disabled={readOnly} onChange={(e) => s.updateResource(r.id, { type: e.target.value as ResourceType })}>
                    <option value="work">{t(lang, "typeWork")}</option>
                    <option value="material">{t(lang, "typeMaterial")}</option>
                    <option value="cost">{t(lang, "typeCost")}</option>
                  </select>
                </td>
                <td>
                  {type === "work" && (
                    <input
                      type="number"
                      dir="ltr"
                      min={0}
                      step={50}
                      className="num"
                      value={Math.round((r.maxUnits ?? 1) * 100)}
                      disabled={readOnly}
                      onChange={(e) => s.updateResource(r.id, { maxUnits: Math.max(0, Number(e.target.value)) / 100 })}
                    />
                  )}
                  {type === "work" && "%"}
                </td>
                <td>
                  {type !== "cost" && (
                    <input
                      type="number"
                      dir="ltr"
                      min={0}
                      className="num"
                      value={r.standardRate ?? 0}
                      disabled={readOnly}
                      onChange={(e) => s.updateResource(r.id, { standardRate: Math.max(0, Number(e.target.value)) })}
                    />
                  )}
                </td>
                <td>
                  {type === "work" && (
                    <select value={r.calendarId ?? ""} disabled={readOnly} onChange={(e) => s.updateResource(r.id, { calendarId: e.target.value || undefined } as Partial<ResourceInput>)}>
                      <option value="">{t(lang, "projectCalendarDefault")}</option>
                      {calendarOptions
                        .filter((c) => c.id !== projectCalId)
                        .map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name ?? c.id}
                          </option>
                        ))}
                    </select>
                  )}
                </td>
                <td dir="ltr">{type === "work" ? fmtDuration(usage?.work ?? 0, minutesPerDay, lang) : ""}</td>
                <td dir="ltr">{Math.round(usage?.cost ?? 0).toLocaleString()}</td>
                <td>{!readOnly && <button onClick={() => s.deleteResource(r.id)}>{t(lang, "remove")}</button>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {!readOnly && (
        <form className="row" onSubmit={add}>
          <input dir="auto" placeholder={t(lang, "resName")} value={newName} onChange={(e) => setNewName(e.target.value)} />
          <button type="submit" className="primary" disabled={!newName.trim()}>
            {t(lang, "addResource")}
          </button>
        </form>
      )}
    </div>
  );
}
