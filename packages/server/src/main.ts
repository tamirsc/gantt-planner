import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildApp } from "./app.js";
import { openDb } from "./db/index.js";

const port = Number(process.env["PORT"] ?? 3000);
const host = process.env["HOST"] ?? "0.0.0.0";
const cookieSecret = process.env["COOKIE_SECRET"];
if (!cookieSecret && process.env["NODE_ENV"] === "production") {
  throw new Error("COOKIE_SECRET must be set in production");
}

const handle = await openDb({
  databaseUrl: process.env["DATABASE_URL"],
  pgliteDir: process.env["DATABASE_URL"] ? undefined : (process.env["PGLITE_DIR"] ?? "./data/pglite"),
});

const app = await buildApp({
  db: handle.db,
  cookieSecret: cookieSecret ?? "dev-secret-change-me",
  corsOrigin: process.env["CORS_ORIGIN"],
  logger: true,
});

// Serve the built web app when it is present (single-container deployment).
const webDist = process.env["WEB_DIST"] ?? join(dirname(fileURLToPath(import.meta.url)), "..", "..", "web", "dist");
if (existsSync(webDist)) {
  const fastifyStatic = (await import("@fastify/static")).default;
  await app.register(fastifyStatic, { root: webDist, wildcard: false });
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/")) return reply.status(404).send({ error: "Not found", code: "NOT_FOUND" });
    return reply.sendFile("index.html");
  });
}

const shutdown = async () => {
  await app.close();
  await handle.close();
  process.exit(0);
};
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());

await app.listen({ port, host });
