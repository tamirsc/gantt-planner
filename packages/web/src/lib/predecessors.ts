import type { DependencyInput, DependencyType } from "@gantt-planner/engine";

/**
 * MS Project style predecessor text: "3", "3FS", "3FS+2d", "5SS-1d", "2FF+4h", separated by
 * ";" or ",". Row numbers are 1-based positions in the outline.
 */
export function formatPredecessors(
  deps: DependencyInput[],
  rowOf: (taskId: string) => number | undefined,
  minutesPerDay: number,
): string {
  return deps
    .map((d) => {
      const row = rowOf(d.predecessorId);
      if (row === undefined) return null;
      const type = d.type ?? "FS";
      const lag = d.lag ?? 0;
      let s = String(row);
      if (type !== "FS" || lag !== 0) s += type;
      if (lag !== 0) {
        const days = lag / minutesPerDay;
        s += (lag > 0 ? "+" : "-") + (Number.isInteger(days) ? `${Math.abs(days)}d` : `${Math.abs(lag / 60)}h`);
      }
      return s;
    })
    .filter((s): s is string => s !== null)
    .join("; ");
}

export function parsePredecessors(
  text: string,
  successorId: string,
  taskAtRow: (row: number) => string | undefined,
  minutesPerDay: number,
): DependencyInput[] | undefined {
  const out: DependencyInput[] = [];
  const parts = text.split(/[;,]/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const m = /^(\d+)\s*(FS|SS|FF|SF)?\s*(?:([+-])\s*(\d+(?:\.\d+)?)\s*(d|h|m|w)?)?$/i.exec(part);
    if (!m) return undefined;
    const predecessorId = taskAtRow(Number(m[1]));
    if (!predecessorId || predecessorId === successorId) return undefined;
    const type = (m[2]?.toUpperCase() as DependencyType | undefined) ?? "FS";
    let lag = 0;
    if (m[3]) {
      const n = Number(m[4]);
      const unit = (m[5] ?? "d").toLowerCase();
      const minutes = unit === "d" ? n * minutesPerDay : unit === "h" ? n * 60 : unit === "w" ? n * minutesPerDay * 5 : n;
      lag = Math.round(m[3] === "-" ? -minutes : minutes);
    }
    out.push({ predecessorId, successorId, type, lag });
  }
  return out;
}
