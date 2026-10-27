import { and, desc, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.js";
import { randomToken, sha256 } from "../auth.js";
import { HttpError, authorize, orgRoleOf, projectRoleOf, requireUser } from "../context.js";
import type { Db } from "../db/index.js";
import { auditLog, invitations, memberships, projectMembers, projects, users } from "../db/schema.js";
import { ORG_ROLES, PROJECT_ROLES, type Actor } from "../policy.js";

const INVITE_DAYS = 7;

export function orgRoutes(app: FastifyInstance, db: Db): void {
  const actorFor = async (userId: string, orgId: string, isSuperadmin: boolean): Promise<Actor> => ({
    orgRole: await orgRoleOf(db, userId, orgId),
    projectRole: null,
    isSuperadmin,
  });

  app.get<{ Params: { orgId: string } }>("/api/orgs/:orgId/members", async (request) => {
    const user = requireUser(request);
    authorize(await actorFor(user.id, request.params.orgId, user.isSuperadmin), "org.list_members");
    return db
      .select({ id: users.id, email: users.email, name: users.name, role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(eq(memberships.orgId, request.params.orgId));
  });

  app.patch<{ Params: { orgId: string; userId: string } }>("/api/orgs/:orgId/members/:userId", async (request) => {
    const user = requireUser(request);
    const { orgId, userId } = request.params;
    const actor = await actorFor(user.id, orgId, user.isSuperadmin);
    authorize(actor, "org.manage_members");
    const body = z.object({ role: z.enum(ORG_ROLES as [string, ...string[]]) }).parse(request.body);
    const role = body.role as (typeof ORG_ROLES)[number];
    // Only owners may create or demote owners.
    const targetRole = await orgRoleOf(db, userId, orgId);
    if (!targetRole) throw new HttpError(404, "Member not found", "NOT_FOUND");
    if ((role === "owner" || targetRole === "owner") && actor.orgRole !== "owner" && !user.isSuperadmin) {
      throw new HttpError(403, "Only owners can change owner roles", "FORBIDDEN");
    }
    if (targetRole === "owner" && role !== "owner") {
      const owners = await db.select().from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.role, "owner")));
      if (owners.length <= 1) throw new HttpError(409, "An organization needs at least one owner", "LAST_OWNER");
    }
    await db.update(memberships).set({ role }).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    await audit(db, { orgId, userId: user.id, action: "org.member.role", detail: { target: userId, from: targetRole, to: role } });
    return { ok: true };
  });

  app.delete<{ Params: { orgId: string; userId: string } }>("/api/orgs/:orgId/members/:userId", async (request) => {
    const user = requireUser(request);
    const { orgId, userId } = request.params;
    const actor = await actorFor(user.id, orgId, user.isSuperadmin);
    authorize(actor, "org.manage_members");
    const targetRole = await orgRoleOf(db, userId, orgId);
    if (!targetRole) throw new HttpError(404, "Member not found", "NOT_FOUND");
    if (targetRole === "owner") throw new HttpError(409, "Transfer ownership before removing an owner", "LAST_OWNER");
    await db.delete(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)));
    // Remove from every project of the org as well.
    const orgProjects = await db.select({ id: projects.id }).from(projects).where(eq(projects.orgId, orgId));
    if (orgProjects.length > 0) {
      await db.delete(projectMembers).where(
        and(eq(projectMembers.userId, userId), inArray(projectMembers.projectId, orgProjects.map((p) => p.id))),
      );
    }
    await audit(db, { orgId, userId: user.id, action: "org.member.remove", detail: { target: userId, role: targetRole } });
    return { ok: true };
  });

  /**
   * Invite someone to the organization, optionally straight into a project.
   * Admins invite anyone; a project manager may invite guests/members into their own project only.
   */
  app.post<{ Params: { orgId: string } }>("/api/orgs/:orgId/invitations", async (request, reply) => {
    const user = requireUser(request);
    const { orgId } = request.params;
    const body = z
      .object({
        email: z.string().email().max(200),
        orgRole: z.enum(["admin", "member", "guest"]).default("guest"),
        projectId: z.string().uuid().optional(),
        projectRole: z.enum(PROJECT_ROLES as [string, ...string[]]).optional(),
      })
      .parse(request.body);
    const actor = await actorFor(user.id, orgId, user.isSuperadmin);
    if (body.projectId) {
      const [p] = await db.select().from(projects).where(and(eq(projects.id, body.projectId), eq(projects.orgId, orgId))).limit(1);
      if (!p) throw new HttpError(404, "Project not found", "NOT_FOUND");
      actor.projectRole = await projectRoleOf(db, user.id, p.id);
    }
    const inviteAsAdmin = body.orgRole === "admin";
    if (inviteAsAdmin || !body.projectId) authorize(actor, "org.manage_members");
    else authorize(actor, "project.invite_guest");
    if (body.projectId && !body.projectRole) throw new HttpError(400, "projectRole is required with projectId", "BAD_REQUEST");

    const token = randomToken();
    const [inv] = await db
      .insert(invitations)
      .values({
        orgId,
        email: body.email.toLowerCase(),
        orgRole: body.orgRole,
        projectId: body.projectId ?? null,
        projectRole: (body.projectRole as (typeof PROJECT_ROLES)[number] | undefined) ?? null,
        tokenHash: sha256(token),
        invitedBy: user.id,
        expiresAt: new Date(Date.now() + INVITE_DAYS * 86_400_000),
      })
      .returning();
    await audit(db, { orgId, projectId: body.projectId ?? null, userId: user.id, action: "invitation.create", detail: { email: inv!.email, orgRole: inv!.orgRole, projectRole: inv!.projectRole } });
    // The token is returned to the caller for now; e-mail delivery comes with the notification service.
    return reply.status(201).send({ id: inv!.id, token, expiresAt: inv!.expiresAt });
  });

  app.get<{ Params: { orgId: string }; Querystring: { limit?: string } }>("/api/orgs/:orgId/audit", async (request) => {
    const user = requireUser(request);
    authorize(await actorFor(user.id, request.params.orgId, user.isSuperadmin), "org.read_audit");
    const limit = Math.min(500, Number(request.query.limit ?? 100) || 100);
    return db.select().from(auditLog).where(eq(auditLog.orgId, request.params.orgId)).orderBy(desc(auditLog.id)).limit(limit);
  });
}
