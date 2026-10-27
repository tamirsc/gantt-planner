import { and, eq, isNull, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { SchedulingError, schedule, type ProjectInput, type TaskInput } from "@gantt-planner/engine";
import { audit } from "../audit.js";
import { HttpError, authorize, loadProject, orgRoleOf, requireUser } from "../context.js";
import type { Db } from "../db/index.js";
import { projectMembers, projects, users } from "../db/schema.js";
import { PROJECT_ROLES, can, type Actor } from "../policy.js";

/** Application-level task: engine input plus fields the engine ignores. */
export type AppTask = TaskInput & { assigneeId?: string; notes?: string };

const projectDataSchema = z
  .object({
    start: z.number(),
    calendarId: z.string().optional(),
    calendars: z.array(z.any()).optional(),
    tasks: z.array(z.object({ id: z.string() }).passthrough()),
    dependencies: z.array(z.object({ predecessorId: z.string(), successorId: z.string() }).passthrough()).optional(),
    options: z.any().optional(),
  })
  .passthrough();

function validateSchedule(data: unknown): ProjectInput {
  const parsed = projectDataSchema.parse(data) as unknown as ProjectInput;
  try {
    schedule(parsed);
  } catch (e) {
    if (e instanceof SchedulingError) throw new HttpError(400, e.message, e.code);
    throw e;
  }
  return parsed;
}

const emptyProject = (): ProjectInput => ({ start: Date.now(), tasks: [], dependencies: [] });

export function projectRoutes(app: FastifyInstance, db: Db): void {
  app.get<{ Params: { orgId: string } }>("/api/orgs/:orgId/projects", async (request) => {
    const user = requireUser(request);
    const { orgId } = request.params;
    const actor: Actor = { orgRole: await orgRoleOf(db, user.id, orgId), projectRole: null, isSuperadmin: user.isSuperadmin };
    if (!actor.orgRole && !user.isSuperadmin) throw new HttpError(404, "Organization not found", "NOT_FOUND");
    const base = db
      .select({ id: projects.id, name: projects.name, version: projects.version, updatedAt: projects.updatedAt, role: projectMembers.role })
      .from(projects)
      .leftJoin(projectMembers, and(eq(projectMembers.projectId, projects.id), eq(projectMembers.userId, user.id)))
      .where(and(eq(projects.orgId, orgId), isNull(projects.deletedAt)));
    const rows = await base;
    if (can(actor, "org.list_all_projects")) return rows.map((r) => ({ ...r, role: r.role ?? "manager" }));
    return rows.filter((r) => r.role !== null);
  });

  app.post<{ Params: { orgId: string } }>("/api/orgs/:orgId/projects", async (request, reply) => {
    const user = requireUser(request);
    const { orgId } = request.params;
    const actor: Actor = { orgRole: await orgRoleOf(db, user.id, orgId), projectRole: null, isSuperadmin: user.isSuperadmin };
    authorize(actor, "org.create_project");
    const body = z.object({ name: z.string().min(1).max(200), data: z.unknown().optional() }).parse(request.body);
    const data = body.data === undefined ? emptyProject() : validateSchedule(body.data);
    const [p] = await db.insert(projects).values({ orgId, name: body.name, data, createdBy: user.id }).returning();
    await db.insert(projectMembers).values({ projectId: p!.id, userId: user.id, role: "manager" });
    await audit(db, { orgId, projectId: p!.id, userId: user.id, action: "project.create", detail: { name: p!.name } });
    return reply.status(201).send({ id: p!.id, name: p!.name, version: p!.version, data: p!.data, role: "manager" });
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (request) => {
    const user = requireUser(request);
    const { project, actor } = await loadProject(db, user, request.params.id);
    return {
      id: project.id,
      orgId: project.orgId,
      name: project.name,
      data: project.data,
      version: project.version,
      updatedAt: project.updatedAt,
      role: actor.projectRole ?? (can(actor, "project.manage_members") ? "manager" : "viewer"),
      permissions: {
        edit: can(actor, "project.edit"),
        updateOwnTasks: can(actor, "project.update_own_tasks"),
        manageMembers: can(actor, "project.manage_members"),
        export: can(actor, "project.export"),
        delete: can(actor, "project.delete"),
      },
    };
  });

  /**
   * Save the whole project document with optimistic concurrency: the caller sends the
   * version it loaded; a different version on the server means someone else saved first (409).
   */
  app.put<{ Params: { id: string } }>("/api/projects/:id", async (request) => {
    const user = requireUser(request);
    const { project, actor } = await loadProject(db, user, request.params.id);
    const body = z.object({ name: z.string().min(1).max(200).optional(), data: z.unknown(), version: z.number().int() }).parse(request.body);
    const next = validateSchedule(body.data);

    if (!can(actor, "project.edit")) {
      authorize(actor, "project.update_own_tasks");
      assertOnlyOwnProgress(project.data as ProjectInput, next, user.id);
      if (body.name !== undefined && body.name !== project.name) throw new HttpError(403, "Not allowed: project.edit", "FORBIDDEN");
    }

    const updated = await db
      .update(projects)
      .set({ data: next, name: body.name ?? project.name, version: project.version + 1, updatedAt: new Date() })
      .where(and(eq(projects.id, project.id), eq(projects.version, body.version)))
      .returning({ version: projects.version });
    if (updated.length === 0) throw new HttpError(409, "The project was modified by someone else; reload and retry", "VERSION_CONFLICT");
    await audit(db, {
      orgId: project.orgId,
      projectId: project.id,
      userId: user.id,
      action: "project.update",
      detail: { fromVersion: body.version, toVersion: updated[0]!.version, tasks: (next.tasks ?? []).length },
    });
    return { version: updated[0]!.version };
  });

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (request) => {
    const user = requireUser(request);
    const { project, actor } = await loadProject(db, user, request.params.id);
    authorize(actor, "project.delete");
    await db.update(projects).set({ deletedAt: new Date() }).where(eq(projects.id, project.id));
    await audit(db, { orgId: project.orgId, projectId: project.id, userId: user.id, action: "project.delete", detail: { name: project.name } });
    return { ok: true };
  });

  app.get<{ Params: { id: string } }>("/api/projects/:id/members", async (request) => {
    const user = requireUser(request);
    const { project } = await loadProject(db, user, request.params.id);
    return db
      .select({ id: users.id, email: users.email, name: users.name, role: projectMembers.role })
      .from(projectMembers)
      .innerJoin(users, eq(users.id, projectMembers.userId))
      .where(eq(projectMembers.projectId, project.id));
  });

  app.put<{ Params: { id: string; userId: string } }>("/api/projects/:id/members/:userId", async (request) => {
    const user = requireUser(request);
    const { project, actor } = await loadProject(db, user, request.params.id);
    authorize(actor, "project.manage_members");
    const body = z.object({ role: z.enum(PROJECT_ROLES as [string, ...string[]]) }).parse(request.body);
    const role = body.role as (typeof PROJECT_ROLES)[number];
    // The user must belong to the organization already (invitations handle outsiders).
    const orgRole = await orgRoleOf(db, request.params.userId, project.orgId);
    if (!orgRole) throw new HttpError(404, "User is not a member of the organization", "NOT_FOUND");
    await db
      .insert(projectMembers)
      .values({ projectId: project.id, userId: request.params.userId, role })
      .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role } });
    await audit(db, { orgId: project.orgId, projectId: project.id, userId: user.id, action: "project.member.role", detail: { target: request.params.userId, role } });
    return { ok: true };
  });

  app.delete<{ Params: { id: string; userId: string } }>("/api/projects/:id/members/:userId", async (request) => {
    const user = requireUser(request);
    const { project, actor } = await loadProject(db, user, request.params.id);
    authorize(actor, "project.manage_members");
    await db.delete(projectMembers).where(and(eq(projectMembers.projectId, project.id), eq(projectMembers.userId, request.params.userId)));
    await audit(db, { orgId: project.orgId, projectId: project.id, userId: user.id, action: "project.member.remove", detail: { target: request.params.userId } });
    return { ok: true };
  });

  app.get("/api/health", async () => {
    await db.execute(sql`select 1`);
    return { ok: true };
  });
}

/**
 * Contributors may only change progress and notes on tasks assigned to them.
 * Everything else in the document must be identical.
 */
function assertOnlyOwnProgress(before: ProjectInput, after: ProjectInput, userId: string): void {
  const deny = (why: string) => {
    throw new HttpError(403, `Contributors can only update progress on their own tasks (${why})`, "FORBIDDEN");
  };
  const strip = (p: ProjectInput) => ({ ...p, tasks: undefined });
  if (stableStringify(strip(before)) !== stableStringify(strip(after))) deny("project settings or dependencies changed");
  if (before.tasks.length !== after.tasks.length) deny("tasks added or removed");
  for (let i = 0; i < before.tasks.length; i++) {
    const a = before.tasks[i] as AppTask;
    const b = after.tasks[i] as AppTask;
    if (a.id !== b.id) deny("task order changed");
    const aRest = { ...a, percentComplete: undefined, notes: undefined };
    const bRest = { ...b, percentComplete: undefined, notes: undefined };
    if (stableStringify(aRest) !== stableStringify(bRest)) deny(`task "${a.name ?? a.id}" changed beyond progress`);
    const changed = a.percentComplete !== b.percentComplete || a.notes !== b.notes;
    if (changed && a.assigneeId !== userId) deny(`task "${a.name ?? a.id}" is not assigned to you`);
  }
}

/** JSON with object keys sorted, so documents round-tripped through JSONB compare equal. */
function stableStringify(value: unknown): string {
  return JSON.stringify(value, (_key, v) => {
    if (v && typeof v === "object" && !Array.isArray(v)) {
      return Object.fromEntries(Object.keys(v as Record<string, unknown>).sort().map((k) => [k, (v as Record<string, unknown>)[k]]));
    }
    return v;
  });
}
