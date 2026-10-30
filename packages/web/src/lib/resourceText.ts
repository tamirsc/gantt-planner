import type { AssignmentInput, ProjectInput, ResourceInput } from "@gantt-planner/engine";

/**
 * MS Project style "Resource Names" text: `Dana[50%]; US engineer; Cement[10]`.
 * Work resources show units as a percentage when not 100%; material resources show quantity.
 */
export function formatResourceNames(project: ProjectInput, taskId: string): string {
  const byId = new Map((project.resources ?? []).map((r) => [r.id, r] as const));
  return (project.assignments ?? [])
    .filter((a) => a.taskId === taskId)
    .map((a) => {
      const r = byId.get(a.resourceId);
      if (!r) return null;
      const name = r.name ?? r.id;
      const units = a.units ?? 1;
      if ((r.type ?? "work") === "material") return `${name}[${units}]`;
      if ((r.type ?? "work") === "cost") return a.cost !== undefined ? `${name}[${a.cost}]` : name;
      return units === 1 ? name : `${name}[${Math.round(units * 1000) / 10}%]`;
    })
    .filter((x): x is string => x !== null)
    .join("; ");
}

export interface ParsedResourceRef {
  name: string;
  /** Units for work (fraction) / quantity for material / amount for cost; undefined = default. */
  value: number | undefined;
  isPercent: boolean;
}

/** Parse the text form. Returns undefined when the text is malformed. */
export function parseResourceNames(text: string): ParsedResourceRef[] | undefined {
  const out: ParsedResourceRef[] = [];
  for (const part of text.split(/[;,]/).map((p) => p.trim()).filter(Boolean)) {
    const m = /^(.*?)\s*(?:\[\s*(-?\d+(?:[.,]\d+)?)\s*(%?)\s*\])?$/.exec(part);
    if (!m || !m[1]) return undefined;
    const value = m[2] !== undefined ? Number(m[2].replace(",", ".")) : undefined;
    if (value !== undefined && !Number.isFinite(value)) return undefined;
    out.push({ name: m[1].trim(), value, isPercent: m[3] === "%" });
  }
  return out;
}

/** Resolve a parsed reference against existing resources, case-insensitively, creating work resources for unknown names. */
export function resolveResource(resources: ResourceInput[], name: string, newId: () => string): { resource: ResourceInput; created: boolean } {
  const found = resources.find((r) => (r.name ?? r.id).localeCompare(name, undefined, { sensitivity: "accent" }) === 0);
  if (found) return { resource: found, created: false };
  return { resource: { id: newId(), name }, created: true };
}

export function unitsFor(ref: ParsedResourceRef, resource: ResourceInput): Pick<AssignmentInput, "units" | "cost"> {
  const type = resource.type ?? "work";
  if (type === "cost") return ref.value !== undefined ? { cost: ref.value } : {};
  if (type === "material") return ref.value !== undefined ? { units: ref.value } : { units: 1 };
  if (ref.value === undefined) return { units: 1 };
  return { units: ref.isPercent || ref.value > 10 ? ref.value / 100 : ref.value };
}
