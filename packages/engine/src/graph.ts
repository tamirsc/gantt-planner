import { SchedulingError } from "./types.js";

/**
 * Kahn topological sort. `edges` maps a node to the nodes that depend on it.
 * Throws SchedulingError("CYCLE") with one offending cycle when the graph is
 * not a DAG.
 */
export function topologicalOrder(nodes: readonly string[], edges: Map<string, Set<string>>): string[] {
  const indegree = new Map<string, number>();
  for (const n of nodes) indegree.set(n, 0);
  for (const [, targets] of edges) for (const t of targets) indegree.set(t, (indegree.get(t) ?? 0) + 1);

  // Stable: process in input order among ready nodes.
  const ready: string[] = nodes.filter((n) => indegree.get(n) === 0);
  const order: string[] = [];
  let head = 0;
  while (head < ready.length) {
    const n = ready[head++]!;
    order.push(n);
    const targets = edges.get(n);
    if (!targets) continue;
    for (const t of targets) {
      const d = indegree.get(t)! - 1;
      indegree.set(t, d);
      if (d === 0) ready.push(t);
    }
  }
  if (order.length !== nodes.length) {
    const cycle = findCycle(nodes, edges, new Set(order));
    throw new SchedulingError(`Circular dependency: ${cycle.join(" → ")}`, "CYCLE", { cycle });
  }
  return order;
}

function findCycle(nodes: readonly string[], edges: Map<string, Set<string>>, done: Set<string>): string[] {
  const color = new Map<string, 1 | 2>();
  const stack: string[] = [];
  const dfs = (n: string): string[] | null => {
    color.set(n, 1);
    stack.push(n);
    for (const t of edges.get(n) ?? []) {
      if (done.has(t)) continue;
      const c = color.get(t);
      if (c === 1) {
        const i = stack.indexOf(t);
        return [...stack.slice(i), t];
      }
      if (!c) {
        const r = dfs(t);
        if (r) return r;
      }
    }
    stack.pop();
    color.set(n, 2);
    return null;
  };
  for (const n of nodes) {
    if (done.has(n) || color.has(n)) continue;
    const r = dfs(n);
    if (r) return r;
  }
  return [];
}
