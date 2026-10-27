import { and, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.js";
import { createSession, hashPassword, sha256 } from "../auth.js";
import { HttpError } from "../context.js";
import type { Db } from "../db/index.js";
import { invitations, memberships, organizations, projectMembers, projects, users } from "../db/schema.js";
import { publicUser } from "./auth.js";

export function invitationRoutes(app: FastifyInstance, db: Db): void {
  const load = async (token: string) => {
    const [inv] = await db
      .select()
      .from(invitations)
      .where(and(eq(invitations.tokenHash, sha256(token)), isNull(invitations.acceptedAt)))
      .limit(1);
    if (!inv || inv.expiresAt.getTime() < Date.now()) throw new HttpError(404, "Invitation not found or expired", "NOT_FOUND");
    return inv;
  };

  /** Public: what the invitation is for, so the accept page can show it. */
  app.get<{ Params: { token: string } }>("/api/invitations/:token", async (request) => {
    const inv = await load(request.params.token);
    const [org] = await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, inv.orgId));
    const project = inv.projectId ? (await db.select({ name: projects.name }).from(projects).where(eq(projects.id, inv.projectId)))[0] : null;
    const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, inv.email)).limit(1);
    return { email: inv.email, orgName: org?.name, orgRole: inv.orgRole, projectName: project?.name ?? null, projectRole: inv.projectRole, accountExists: !!existing };
  });

  /**
   * Accept: creates the account when needed (name + password), adds the memberships
   * and signs the user in. An already signed-in user with the invited e-mail just gets the memberships.
   */
  app.post<{ Params: { token: string } }>("/api/invitations/:token/accept", async (request, reply) => {
    const inv = await load(request.params.token);
    const body = z.object({ name: z.string().min(1).max(100).optional(), password: z.string().min(8).max(200).optional() }).parse(request.body ?? {});
    let [user] = await db.select().from(users).where(eq(users.email, inv.email)).limit(1);
    if (request.user && request.user.email !== inv.email) throw new HttpError(403, "Invitation was sent to a different e-mail", "FORBIDDEN");
    if (!user) {
      if (!body.name || !body.password) throw new HttpError(400, "name and password are required to create the account", "BAD_REQUEST");
      [user] = await db.insert(users).values({ email: inv.email, name: body.name, passwordHash: hashPassword(body.password) }).returning();
    }
    const u = user!;
    await db
      .insert(memberships)
      .values({ orgId: inv.orgId, userId: u.id, role: inv.orgRole })
      .onConflictDoNothing();
    if (inv.projectId && inv.projectRole) {
      await db
        .insert(projectMembers)
        .values({ projectId: inv.projectId, userId: u.id, role: inv.projectRole })
        .onConflictDoUpdate({ target: [projectMembers.projectId, projectMembers.userId], set: { role: inv.projectRole } });
    }
    await db.update(invitations).set({ acceptedAt: new Date() }).where(eq(invitations.id, inv.id));
    await audit(db, { orgId: inv.orgId, projectId: inv.projectId, userId: u.id, action: "invitation.accept", detail: { orgRole: inv.orgRole, projectRole: inv.projectRole } });
    if (!request.user) await createSession(db, u.id, request.headers["user-agent"], reply);
    return { user: publicUser(u), orgId: inv.orgId, projectId: inv.projectId };
  });
}
