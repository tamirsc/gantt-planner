import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import Fastify, { type FastifyInstance } from "fastify";
import { ZodError } from "zod";
import { userFromRequest } from "./auth.js";
import { HttpError } from "./context.js";
import type { Db } from "./db/index.js";
import { authRoutes } from "./routes/auth.js";
import { invitationRoutes } from "./routes/invitations.js";
import { orgRoutes } from "./routes/orgs.js";
import { projectRoutes } from "./routes/projects.js";

export interface AppOptions {
  db: Db;
  cookieSecret: string;
  corsOrigin?: string | undefined;
  logger?: boolean;
}

export async function buildApp(opts: AppOptions): Promise<FastifyInstance> {
  const app = Fastify({ logger: opts.logger ?? false, bodyLimit: 20 * 1024 * 1024 });
  await app.register(cookie, { secret: opts.cookieSecret });
  if (opts.corsOrigin) await app.register(cors, { origin: opts.corsOrigin, credentials: true });

  // Accept an empty body on JSON requests (e.g. POST /logout from fetch with a JSON content-type).
  app.addContentTypeParser("application/json", { parseAs: "string" }, (_req, body, done) => {
    const text = typeof body === "string" ? body : body.toString("utf8");
    if (text.trim() === "") return done(null, undefined);
    try {
      done(null, JSON.parse(text));
    } catch (e) {
      done(Object.assign(e as Error, { statusCode: 400 }), undefined);
    }
  });

  app.decorateRequest("user", null);
  app.addHook("preHandler", async (request) => {
    request.user = await userFromRequest(opts.db, request);
  });

  app.setErrorHandler((err: unknown, _request, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code ?? null });
    if (err instanceof ZodError) return reply.status(400).send({ error: "Invalid request", code: "BAD_REQUEST", issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) app.log.error(err);
    const message = err instanceof Error ? err.message : "Error";
    return reply.status(status).send({ error: status >= 500 ? "Internal error" : message, code: status >= 500 ? "INTERNAL" : "BAD_REQUEST" });
  });

  authRoutes(app, opts.db);
  orgRoutes(app, opts.db);
  invitationRoutes(app, opts.db);
  projectRoutes(app, opts.db);
  return app;
}
