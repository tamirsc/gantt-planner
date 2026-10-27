import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Db } from "./db/index.js";
import { memberships, projectMembers, projects, type OrgRole, type ProjectRole, type User } from "./db/schema.js";
import { can, type Action, type Actor } from "./policy.js";

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code?: string,
  ) {
    super(message);
  }
}

declare module "fastify" {
  interface FastifyRequest {
    user: User | null;
  }
}

export function requireUser(request: FastifyRequest): User {
  if (!request.user) throw new HttpError(401, "Authentication required", "UNAUTHENTICATED");
  return request.user;
}

export async function orgRoleOf(db: Db, userId: string, orgId: string): Promise<OrgRole | null> {
  const row = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
    .limit(1);
  return row[0]?.role ?? null;
}

export async function projectRoleOf(db: Db, userId: string, projectId: string): Promise<ProjectRole | null> {
  const row = await db
    .select({ role: projectMembers.role })
    .from(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)))
    .limit(1);
  return row[0]?.role ?? null;
}

export interface ProjectContext {
  project: typeof projects.$inferSelect;
  actor: Actor;
}

/** Load a project and the caller's effective roles; 404 for unknown or inaccessible projects. */
export async function loadProject(db: Db, user: User, projectId: string): Promise<ProjectContext> {
  const rows = await db.select().from(projects).where(eq(projects.id, projectId)).limit(1);
  const project = rows[0];
  if (!project || project.deletedAt) throw new HttpError(404, "Project not found", "NOT_FOUND");
  const actor: Actor = {
    orgRole: await orgRoleOf(db, user.id, project.orgId),
    projectRole: await projectRoleOf(db, user.id, project.id),
    isSuperadmin: user.isSuperadmin,
  };
  if (!can(actor, "project.read")) throw new HttpError(404, "Project not found", "NOT_FOUND");
  return { project, actor };
}

export function authorize(actor: Actor, action: Action): void {
  if (!can(actor, action)) throw new HttpError(403, `Not allowed: ${action}`, "FORBIDDEN");
}

export function sendError(reply: FastifyReply, err: unknown): FastifyReply {
  if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code ?? null });
  throw err;
}
