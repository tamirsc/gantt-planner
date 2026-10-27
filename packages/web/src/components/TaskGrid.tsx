import { useEffect, useRef, useState } from "react";
import type { ScheduledTask } from "@gantt-planner/engine";
import { dayStart, utc } from "@gantt-planner/engine";
import { t } from "../i18n";
import { calendarFor } from "../lib/calendars";
import { fmtDate, fmtDuration, parseDuration } from "../lib/format";
import { formatPredecessors, parsePredecessors } from "../lib/predecessors";
import { HEADER_HEIGHT, ROW_HEIGHT } from "../lib/timeline";
import { allRows, useStore, type AppTask } from "../store";

interface Props {
  rows: string[];
  readOnly: boolean;
  /** Read-only except progress on tasks assigned to the current user (contributor role). */
  progressOnly: boolean;
}

export function TaskGrid({ rows, readOnly, progressOnly }: Props) {
  const s = useStore();
  const lang = s.prefs.lang;
  const me = s.session?.user.id;
  const order = allRows(s.project);
  const rowNumber = new Map(order.map((id, i) => [id, i + 1] as const));
  const minutesPerDay = calendarFor(s.project).minutesPerDay;
  const depsBySucc = new Map<string, typeof s.project.dependencies>();
  for (const d of s.project.dependencies ?? []) (depsBySucc.get(d.successorId) ?? depsBySucc.set(d.successorId, []).get(d.successorId)!).push(d);

  const onRowClick = (id: string, e: React.MouseEvent) => {
    if (e.shiftKey && s.selected.length > 0) {
      const a = rows.indexOf(s.selected[0]!);
      const b = rows.indexOf(id);
      const [lo, hi] = a < b ? [a, b] : [b, a];
      s.select(rows.slice(lo, hi + 1));
    } else if (e.ctrlKey || e.metaKey) {
      s.select(s.selected.includes(id) ? s.selected.filter((x) => x !== id) : [...s.selected, id]);
    } else s.select([id]);
  };

  return (
    <table className="grid" style={{ ["--row-h" as string]: `${ROW_HEIGHT}px`, ["--header-h" as string]: `${HEADER_HEIGHT}px` }}>
      <thead>
        <tr>
          <th className="c-id">{t(lang, "colId")}</th>
          <th className="c-wbs">{t(lang, "colWbs")}</th>
          <th className="c-name">{t(lang, "colName")}</th>
          <th className="c-dur">{t(lang, "colDuration")}</th>
          <th className="c-date">{t(lang, "colStart")}</th>
          <th className="c-date">{t(lang, "colFinish")}</th>
          <th className="c-pred">{t(lang, "colPredecessors")}</th>
          <th className="c-pct">{t(lang, "colProgress")}</th>
          <th className="c-assignee">{t(lang, "colAssignee")}</th>
          <th className="c-slack">{t(lang, "colSlack")}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((id) => {
          const task = s.result.tasks[id]!;
          const input = s.project.tasks.find((x) => x.id === id)! as AppTask;
          const selected = s.selected.includes(id);
          const canEditProgress = !task.isSummary && (!readOnly || (progressOnly && input.assigneeId === me));
          const cal = calendarFor(s.project, task.calendarId);
          return (
            <tr
              key={id}
              className={[selected ? "selected" : "", task.isSummary ? "summary" : "", task.isCritical && s.prefs.highlightCritical ? "critical" : ""].join(" ")}
              onClick={(e) => onRowClick(id, e)}
            >
              <td className="c-id">{rowNumber.get(id)}</td>
              <td className="c-wbs">{task.wbs}</td>
              <td className="c-name">
                <div className="name-cell" style={{ paddingInlineStart: `${(task.outlineLevel - 1) * 16}px` }}>
                  {task.isSummary ? (
                    <button
                      className="twisty"
                      onClick={(e) => {
                        e.stopPropagation();
                        s.toggleCollapse(id);
                      }}
                    >
                      {s.collapsed.has(id) ? "▸" : "▾"}
                    </button>
                  ) : (
                    <span className="twisty-space">{task.isMilestone ? "◆" : ""}</span>
                  )}
                  <EditableCell
                    value={task.name}
                    placeholder={t(lang, "untitled")}
                    readOnly={readOnly}
                    onCommit={(v) => s.updateTask(id, { name: v })}
                  />
                </div>
              </td>
              <td className="c-dur">
                {task.isSummary ? (
                  <span>{fmtDuration(task.duration, cal.minutesPerDay, lang)}</span>
                ) : (
                  <EditableCell
                    value={fmtDuration(task.duration, cal.minutesPerDay, lang)}
                    readOnly={readOnly}
                    onCommit={(v) => {
                      const d = parseDuration(v, cal.minutesPerDay);
                      if (d !== undefined) s.updateTask(id, { duration: d });
                    }}
                  />
                )}
              </td>
              <td className="c-date">
                {task.isSummary ? (
                  fmtDate(lang, task.start)
                ) : (
                  <DateCell
                    value={task.start}
                    lang={lang}
                    readOnly={readOnly}
                    title={constraintTitle(task, input.constraintDate, lang)}
                    onCommit={(ms) => {
                      if (input.schedulingMode === "manual") s.updateTask(id, { start: ms });
                      else s.updateTask(id, { constraintType: "SNET", constraintDate: ms });
                    }}
                  />
                )}
              </td>
              <td className="c-date">{fmtDate(lang, task.finish)}</td>
              <td className="c-pred">
                <EditableCell
                  value={formatPredecessors(depsBySucc.get(id) ?? [], (tid) => rowNumber.get(tid), minutesPerDay)}
                  onCommit={(v) => {
                    const deps = parsePredecessors(v, id, (row) => order[row - 1], minutesPerDay);
                    if (deps) s.setPredecessors(id, deps);
                  }}
                  readOnly={readOnly}
                  ltr
                />
              </td>
              <td className="c-pct">
                {task.isSummary ? (
                  ""
                ) : (
                  <EditableCell
                    value={String(input.percentComplete ?? 0)}
                    readOnly={!canEditProgress}
                    ltr
                    onCommit={(v) => {
                      const n = Math.max(0, Math.min(100, Math.round(Number(v))));
                      if (Number.isFinite(n)) s.updateTask(id, { percentComplete: n });
                    }}
                  />
                )}
              </td>
              <td className="c-assignee">
                {task.isSummary ? (
                  ""
                ) : readOnly ? (
                  <span dir="auto">{s.members.find((m) => m.id === input.assigneeId)?.name ?? ""}</span>
                ) : (
                  <select
                    className="cell-select"
                    value={input.assigneeId ?? ""}
                    onClick={(e) => e.stopPropagation()}
                    onChange={(e) => s.updateTask(id, { assigneeId: e.target.value || undefined } as Partial<AppTask>)}
                  >
                    <option value="">{t(lang, "unassigned")}</option>
                    {s.members.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                )}
              </td>
              <td className="c-slack" title={`${task.totalSlack} min`}>
                {fmtDuration(task.totalSlack, cal.minutesPerDay, lang)}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

function constraintTitle(task: ScheduledTask, date: number | undefined, lang: "he" | "en"): string {
  if (task.constraintType === "ASAP") return "";
  return `${task.constraintType}${date !== undefined ? " " + fmtDate(lang, date) : ""}`;
}

function EditableCell({
  value,
  placeholder,
  onCommit,
  ltr,
  readOnly,
}: {
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
  ltr?: boolean;
  readOnly?: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (editing) ref.current?.select();
  }, [editing]);
  if (!editing) {
    return (
      <span
        className={"cell-text" + (value ? "" : " placeholder") + (readOnly ? " ro" : "")}
        dir={ltr ? "ltr" : "auto"}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setDraft(value);
          setEditing(true);
        }}
      >
        {value || placeholder || " "}
      </span>
    );
  }
  return (
    <input
      ref={ref}
      autoFocus
      className="cell-input"
      dir={ltr ? "ltr" : "auto"}
      value={draft}
      onChange={(e) => setDraft(e.target.value)}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          setEditing(false);
        }
      }}
    />
  );
}

function DateCell({ value, lang, title, onCommit, readOnly }: { value: number; lang: "he" | "en"; title: string; onCommit: (ms: number) => void; readOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  if (!editing) {
    return (
      <span
        className={"cell-text" + (title ? " constrained" : "") + (readOnly ? " ro" : "")}
        title={title}
        onClick={(e) => {
          if (readOnly) return;
          e.stopPropagation();
          setEditing(true);
        }}
      >
        {fmtDate(lang, value)}
      </span>
    );
  }
  return (
    <input
      autoFocus
      type="date"
      className="cell-input"
      defaultValue={new Date(dayStart(value)).toISOString().slice(0, 10)}
      onClick={(e) => e.stopPropagation()}
      onBlur={(e) => {
        setEditing(false);
        if (e.target.value) onCommit(utc(e.target.value));
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}
