import { useMemo, useRef, useState } from "react";
import { MS_PER_DAY, dayStart, type DependencyInput, type ScheduledTask } from "@gantt-planner/engine";
import { t, type Lang } from "../i18n";
import { calendarFor } from "../lib/calendars";
import { fmtDate, fmtDayNumber, fmtMonth, fmtShortMonthDay, fmtWeekday } from "../lib/format";
import { HEADER_HEIGHT, ROW_HEIGHT, eachDay, monthStart, msAt, nextMonth, span, weekStart, xOf, type Scale } from "../lib/timeline";
import { useStore } from "../store";

interface Props {
  rows: string[];
  scale: Scale;
  readOnly: boolean;
}

type Drag =
  | { mode: "move" | "resize"; id: string; startX: number; dx: number }
  | { mode: "link"; id: string; startX: number; startY: number; x: number; y: number };

const BAR_H = 16;
const BAR_Y = (ROW_HEIGHT - BAR_H) / 2;

export function GanttChart({ rows, scale, readOnly }: Props) {
  const s = useStore();
  const lang = s.prefs.lang;
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<Drag | null>(null);
  const rowIndex = useMemo(() => new Map(rows.map((id, i) => [id, i] as const)), [rows]);
  const height = HEADER_HEIGHT + rows.length * ROW_HEIGHT;
  const dir = scale.rtl ? -1 : 1; // pixel direction of "later"
  const projectCal = calendarFor(s.project);

  const localX = (e: React.PointerEvent): { x: number; y: number } => {
    const rect = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDrag = (e: React.PointerEvent, d: Drag) => {
    if (readOnly) return;
    e.stopPropagation();
    e.preventDefault();
    svgRef.current?.setPointerCapture(e.pointerId);
    setDrag(d);
  };

  const onMove = (e: React.PointerEvent) => {
    if (!drag) return;
    const { x, y } = localX(e);
    if (drag.mode === "link") setDrag({ ...drag, x, y });
    else setDrag({ ...drag, dx: x - drag.startX });
  };

  const onUp = (e: React.PointerEvent) => {
    if (!drag) return;
    const task = s.result.tasks[drag.id]!;
    if (drag.mode === "link") {
      const { y } = localX(e);
      const idx = Math.floor((y - HEADER_HEIGHT) / ROW_HEIGHT);
      const target = rows[idx];
      if (target && target !== drag.id) {
        const dep: DependencyInput = { predecessorId: drag.id, successorId: target, type: "FS", lag: 0 };
        s.addDependency(dep);
      }
    } else {
      const deltaDays = Math.round((drag.dx * dir) / scale.pxPerDay);
      if (deltaDays !== 0) {
        if (drag.mode === "move") {
          s.moveTask(drag.id, dayStart(task.start) + deltaDays * MS_PER_DAY);
        } else {
          const cal = calendarFor(s.project, task.calendarId);
          const newFinish = cal.prevWorkingTime(dayStart(task.finish) + (deltaDays + 1) * MS_PER_DAY);
          const duration = Math.max(0, cal.workingMinutesBetween(task.start, newFinish));
          s.resizeTask(drag.id, duration);
        }
      }
    }
    setDrag(null);
  };

  // ---- header ---------------------------------------------------------------
  const header = useMemo(() => {
    const top: { x: number; w: number; label: string }[] = [];
    const bottom: { x: number; w: number; label: string; off: boolean }[] = [];
    for (let m = monthStart(scale.from); m < scale.to; m = nextMonth(m)) {
      const a = Math.max(m, scale.from);
      const b = Math.min(nextMonth(m), scale.to);
      const { x, w } = span(scale, a, b);
      top.push({ x, w, label: fmtMonth(lang, m) });
    }
    if (scale.pxPerDay >= 24) {
      for (const d of eachDay(scale)) {
        const { x, w } = span(scale, d, d + MS_PER_DAY);
        bottom.push({ x, w, label: `${fmtWeekday(lang, d)} ${fmtDayNumber(lang, d)}`, off: !projectCal.isWorkingDay(d) });
      }
    } else if (scale.pxPerDay >= 8) {
      for (let w = weekStart(scale.from); w < scale.to; w += 7 * MS_PER_DAY) {
        const a = Math.max(w, scale.from);
        const b = Math.min(w + 7 * MS_PER_DAY, scale.to);
        const sp = span(scale, a, b);
        bottom.push({ x: sp.x, w: sp.w, label: fmtShortMonthDay(lang, w), off: false });
      }
    }
    return { top, bottom };
  }, [scale, lang, projectCal]);

  // ---- non-working shading ----------------------------------------------------
  const shading = useMemo(() => {
    const out: { x: number; w: number }[] = [];
    if (scale.pxPerDay < 3) return out;
    for (const d of eachDay(scale)) {
      if (!projectCal.isWorkingDay(d)) {
        const { x, w } = span(scale, d, d + MS_PER_DAY);
        out.push({ x, w });
      }
    }
    return out;
  }, [scale, projectCal]);

  const now = Date.now();
  const todayX = now >= scale.from && now < scale.to ? xOf(scale, now) : null;

  const barColor = (task: ScheduledTask) => {
    if (task.schedulingMode === "manual") return "#0d9488";
    if (s.prefs.highlightCritical && task.isCritical) return "#dc2626";
    return "#2563eb";
  };

  // ---- dependencies -----------------------------------------------------------
  const links = (s.project.dependencies ?? [])
    .map((d) => {
      const pi = rowIndex.get(d.predecessorId);
      const si = rowIndex.get(d.successorId);
      if (pi === undefined || si === undefined) return null;
      const p = s.result.tasks[d.predecessorId]!;
      const sc = s.result.tasks[d.successorId]!;
      const type = d.type ?? "FS";
      const px = xOf(scale, type === "FS" || type === "FF" ? p.finish : p.start);
      const sx = xOf(scale, type === "FS" || type === "SS" ? sc.start : sc.finish);
      const py = HEADER_HEIGHT + pi * ROW_HEIGHT + ROW_HEIGHT / 2;
      const sy = HEADER_HEIGHT + si * ROW_HEIGHT + ROW_HEIGHT / 2;
      const predAtFinish = type === "FS" || type === "FF";
      const succAtStart = type === "FS" || type === "SS";
      const exit = px + (predAtFinish ? 10 : -10) * dir;
      const approach = sx + (succAtStart ? -8 : 8) * dir;
      const arrowDir = succAtStart ? dir : -dir;
      const points = `${px},${py} ${exit},${py} ${exit},${sy} ${approach},${sy}`;
      const arrow = `${sx},${sy} ${sx - 7 * arrowDir},${sy - 4} ${sx - 7 * arrowDir},${sy + 4}`;
      const critical = s.prefs.highlightCritical && p.isCritical && sc.isCritical;
      return { key: `${d.predecessorId}-${d.successorId}-${type}`, points, arrow, critical };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  return (
    <svg
      ref={svgRef}
      className={"gantt" + (drag ? " dragging" : "") + (readOnly ? " readonly" : "")}
      width={scale.width}
      height={height}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={() => setDrag(null)}
    >
      <defs>
        <pattern id="offday" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
          <rect width="6" height="6" fill="#f1f5f9" />
          <line x1="0" y1="0" x2="0" y2="6" stroke="#e2e8f0" strokeWidth="2" />
        </pattern>
      </defs>

      {/* row stripes & shading */}
      {rows.map((id, i) => (
        <rect
          key={id}
          x={0}
          y={HEADER_HEIGHT + i * ROW_HEIGHT}
          width={scale.width}
          height={ROW_HEIGHT}
          className={"row-bg" + (s.selected.includes(id) ? " selected" : "")}
          onClick={() => s.select([id])}
        />
      ))}
      {shading.map((r, i) => (
        <rect key={i} x={r.x} y={HEADER_HEIGHT} width={r.w} height={height - HEADER_HEIGHT} fill="url(#offday)" pointerEvents="none" />
      ))}
      {rows.map((_, i) => (
        <line key={i} x1={0} x2={scale.width} y1={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT - 0.5} y2={HEADER_HEIGHT + (i + 1) * ROW_HEIGHT - 0.5} className="row-line" />
      ))}

      {/* header */}
      <g className="header">
        <rect x={0} y={0} width={scale.width} height={HEADER_HEIGHT} className="header-bg" />
        {header.top.map((c, i) => (
          <g key={i}>
            <line x1={c.x} x2={c.x} y1={0} y2={height} className="month-line" />
            <text x={c.x + c.w / 2} y={16} textAnchor="middle" className="hdr-top">
              {c.w > 40 ? c.label : ""}
            </text>
          </g>
        ))}
        {header.bottom.map((c, i) => (
          <g key={i}>
            <line x1={c.x} x2={c.x} y1={HEADER_HEIGHT / 2} y2={height} className="day-line" />
            <text x={c.x + c.w / 2} y={HEADER_HEIGHT - 8} textAnchor="middle" className={"hdr-bottom" + (c.off ? " off" : "")}>
              {c.label}
            </text>
          </g>
        ))}
      </g>

      {/* today */}
      {todayX !== null && (
        <g className="today">
          <line x1={todayX} x2={todayX} y1={HEADER_HEIGHT} y2={height} />
          <text x={todayX + 3 * dir} y={HEADER_HEIGHT + 10} textAnchor={dir > 0 ? "start" : "end"}>
            {t(lang, "today")}
          </text>
        </g>
      )}

      {/* dependencies */}
      <g className="links">
        {links.map((l) => (
          <g key={l.key} className={l.critical ? "critical" : ""}>
            <polyline points={l.points} fill="none" />
            <polygon points={l.arrow} />
          </g>
        ))}
      </g>

      {/* bars */}
      {rows.map((id, i) => {
        const task = s.result.tasks[id]!;
        const input = s.project.tasks.find((x) => x.id === id)!;
        const y = HEADER_HEIGHT + i * ROW_HEIGHT;
        const dragging = drag && drag.mode !== "link" && drag.id === id ? drag.dx : 0;
        const title = `${task.name}\n${fmtDate(lang, task.start)} – ${fmtDate(lang, task.finish)}\n${t(lang, "colSlack")}: ${task.totalSlack / projectCal.minutesPerDay}d`;

        if (task.isSummary) {
          const { x, w } = span(scale, task.start, task.finish);
          return (
            <g key={id} className="bar summary" onClick={() => s.select([id])}>
              <title>{title}</title>
              <rect x={x} y={y + 9} width={w} height={7} />
              <polygon points={`${x},${y + 16} ${x + 6},${y + 16} ${x},${y + 22}`} />
              <polygon points={`${x + w},${y + 16} ${x + w - 6},${y + 16} ${x + w},${y + 22}`} />
            </g>
          );
        }

        if (task.isMilestone) {
          const cx = xOf(scale, task.finish) + dragging;
          const cy = y + ROW_HEIGHT / 2;
          return (
            <g key={id} className="bar milestone" onPointerDown={(e) => startDrag(e, { mode: "move", id, startX: localX(e).x, dx: 0 })}>
              <title>{title}</title>
              <polygon points={`${cx},${cy - 8} ${cx + 8},${cy} ${cx},${cy + 8} ${cx - 8},${cy}`} fill={barColor(task)} />
              <text x={cx + 12 * dir} y={cy + 4} textAnchor={dir > 0 ? "start" : "end"} className="bar-label">
                {task.name}
              </text>
              {input.deadline !== undefined && <Deadline x={xOf(scale, input.deadline)} y={y} />}
            </g>
          );
        }

        const { x, w } = span(scale, task.start, task.finish);
        const bx = x + (drag?.mode === "move" && drag.id === id ? dragging : 0);
        const bw = w + (drag?.mode === "resize" && drag.id === id ? dragging * dir : 0);
        const pct = Math.max(0, Math.min(100, input.percentComplete ?? 0));
        const laterEdge = dir > 0 ? bx + Math.max(2, bw) : bx; // the finish side
        const resizeX = dir > 0 ? bx + Math.max(2, bw) - 5 : bx;
        return (
          <g key={id} className="bar task" onClick={() => s.select([id])}>
            <title>{title}</title>
            <rect
              x={bx}
              y={y + BAR_Y}
              width={Math.max(2, bw)}
              height={BAR_H}
              rx={3}
              fill={barColor(task)}
              onPointerDown={(e) => startDrag(e, { mode: "move", id, startX: localX(e).x, dx: 0 })}
            />
            {pct > 0 && <rect x={dir > 0 ? bx : bx + bw * (1 - pct / 100)} y={y + BAR_Y + 5} width={(Math.max(2, bw) * pct) / 100} height={BAR_H - 10} className="progress" pointerEvents="none" />}
            <rect
              x={resizeX}
              y={y + BAR_Y}
              width={5}
              height={BAR_H}
              className="resize-handle"
              onPointerDown={(e) => startDrag(e, { mode: "resize", id, startX: localX(e).x, dx: 0 })}
            />
            <circle
              cx={laterEdge + 7 * dir}
              cy={y + ROW_HEIGHT / 2}
              r={4}
              className="link-handle"
              onPointerDown={(e) => {
                const p = localX(e);
                startDrag(e, { mode: "link", id, startX: p.x, startY: p.y, x: p.x, y: p.y });
              }}
            >
              <title>{t(lang, "linkHint")}</title>
            </circle>
            <text x={laterEdge + 14 * dir} y={y + ROW_HEIGHT / 2 + 4} textAnchor={dir > 0 ? "start" : "end"} className="bar-label">
              {task.name}
            </text>
            {input.deadline !== undefined && <Deadline x={xOf(scale, input.deadline)} y={y} />}
          </g>
        );
      })}

      {drag?.mode === "link" && <line x1={drag.startX} y1={drag.startY} x2={drag.x} y2={drag.y} className="link-preview" />}

      {/* invisible hit layer for date readout while dragging */}
      {drag && drag.mode !== "link" && (
        <text x={10} y={height - 6} className="drag-readout" style={{ direction: "ltr" }}>
          {fmtDate(lang, msAt(scale, (drag.startX + drag.dx)))}
        </text>
      )}
    </svg>
  );
}

function Deadline({ x, y }: { x: number; y: number }) {
  return <polygon className="deadline" points={`${x},${y + ROW_HEIGHT - 4} ${x - 6},${y + ROW_HEIGHT - 12} ${x + 6},${y + ROW_HEIGHT - 12}`} />;
}
