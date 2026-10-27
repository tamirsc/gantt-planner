import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { audit } from "../audit.js";
import { createSession, destroySession, hashPassword, verifyPassword } from "../auth.js";
import { HttpError, requireUser } from "../context.js";
import type { Db } from "../db/index.js";
import { memberships, organizations, users } from "../db/schema.js";

const signupSchema = z.object({
  email: z.string().email().max(200),
  name: z.string().min(1).max(100),
  password: z.string().min(8).max(200),
  orgName: z.string().min(1).max(100),
  locale: z.enum(["he", "en"]).optional(),
});
const loginSchema = z.object({ email: z.string().email(), password: z.string() });

export function authRoutes(app: FastifyInstance, db: Db): void {
  /** Sign up and create a new organization; the user becomes its owner. */
  app.post("/api/auth/signup", async (request, reply) => {
    const body = signupSchema.parse(request.body);
    const email = body.email.toLowerCase();
    const existing = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
    if (existing.length > 0) throw new HttpError(409, "Email already registered", "EMAIL_TAKEN");
    const [user] = await db
      .insert(users)
      .values({ email, name: body.name, passwordHash: hashPassword(body.password), locale: body.locale ?? "he" })
      .returning();
    const [org] = await db.insert(organizations).values({ name: body.orgName }).returning();
    await db.insert(memberships).values({ orgId: org!.id, userId: user!.id, role: "owner" });
    await audit(db, { orgId: org!.id, userId: user!.id, action: "org.create", detail: { name: org!.name } });
    await createSession(db, user!.id, request.headers["user-agent"], reply);
    return reply.status(201).send({ user: publicUser(user!), org });
  });

  app.post("/api/auth/login", async (request, reply) => {
    const body = loginSchema.parse(request.body);
    const [user] = await db.select().from(users).where(eq(users.email, body.email.toLowerCase())).limit(1);
    if (!user || !verifyPassword(body.password, user.passwordHash)) {
      throw new HttpError(401, "Invalid email or password", "BAD_CREDENTIALS");
    }
    await createSession(db, user.id, request.headers["user-agent"], reply);
    return { user: publicUser(user) };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    await destroySession(db, request, reply);
    return { ok: true };
  });

  app.get("/api/me", async (request) => {
    const user = requireUser(request);
    const orgs = await db
      .select({ id: organizations.id, name: organizations.name, role: memberships.role })
      .from(memberships)
      .innerJoin(organizations, eq(organizations.id, memberships.orgId))
      .where(eq(memberships.userId, user.id));
    return { user: publicUser(user), orgs };
  });
}

export function publicUser(u: typeof users.$inferSelect) {
  return { id: u.id, email: u.email, name: u.name, locale: u.locale, isSuperadmin: u.isSuperadmin };
}
