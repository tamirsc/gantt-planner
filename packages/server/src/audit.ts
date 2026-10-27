import type { Db } from "./db/index.js";
import { auditLog } from "./db/schema.js";

export async function audit(
  db: Db,
  entry: { orgId: string; projectId?: string | null; userId: string | null; action: string; detail?: unknown },
): Promise<void> {
  await db.insert(auditLog).values({
    orgId: entry.orgId,
    projectId: entry.projectId ?? null,
    userId: entry.userId,
    action: entry.action,
    detail: entry.detail ?? null,
  });
}
