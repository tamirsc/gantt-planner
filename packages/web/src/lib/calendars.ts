import { WorkCalendar, israelStandard, presetCalendars, type CalendarDefinition, type ProjectInput } from "@gantt-planner/engine";

const cache = new WeakMap<ProjectInput, Map<string, WorkCalendar>>();

export function calendarDefs(project: ProjectInput): Map<string, CalendarDefinition> {
  const defs = new Map<string, CalendarDefinition>();
  for (const d of presetCalendars) defs.set(d.id, d);
  for (const d of project.calendars ?? []) defs.set(d.id, d);
  return defs;
}

export function projectCalendarId(project: ProjectInput): string {
  return project.calendarId ?? project.calendars?.[0]?.id ?? israelStandard.id;
}

export function calendarFor(project: ProjectInput, calendarId?: string): WorkCalendar {
  const id = calendarId ?? projectCalendarId(project);
  let m = cache.get(project);
  if (!m) cache.set(project, (m = new Map()));
  let cal = m.get(id);
  if (!cal) {
    const def = calendarDefs(project).get(id) ?? israelStandard;
    cal = new WorkCalendar(def);
    m.set(id, cal);
  }
  return cal;
}
