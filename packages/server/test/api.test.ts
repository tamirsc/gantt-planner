import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { FastifyInstance } from "fastify";
import { utc } from "@gantt-planner/engine";
import { buildApp } from "../src/app.js";
import { openDb, type DbHandle } from "../src/db/index.js";

let handle: DbHandle;
let app: FastifyInstance;

beforeAll(async () => {
  handle = await openDb();
  app = await buildApp({ db: handle.db, cookieSecret: "test-secret" });
  await app.ready();
});
afterAll(async () => {
  await app.close();
  await handle.close();
});

/** A tiny client that keeps the session cookie between calls. */
function client() {
  let cookie = "";
  const call = async (method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", url: string, body?: unknown) => {
    const res = await app.inject({ method, url, headers: { cookie, "content-type": "application/json" }, payload: body === undefined ? undefined : JSON.stringify(body) });
    const set = res.headers["set-cookie"];
    if (set) {
      const first = Array.isArray(set) ? set[0]! : set;
      cookie = first.split(";")[0]!;
      if (cookie.endsWith("=")) cookie = ""; // cleared
    }
    return { status: res.statusCode, body: res.json() as any };
  };
  return { call };
}

const D = 480;
const sampleData = () => ({
  start: utc("2026-11-01"),
  tasks: [
    { id: "a", name: "A", duration: 2 * D, assigneeId: "" },
    { id: "b", name: "B", duration: 3 * D, percentComplete: 0 },
  ],
  dependencies: [{ predecessorId: "a", successorId: "b" }],
});

describe("auth and organizations", () => {
  const owner = client();
  let orgId: string;

  it("signs up, creates an organization and signs in", async () => {
    const r = await owner.call("POST", "/api/auth/signup", { email: "Tamir@Example.com", name: "Tamir", password: "secret-pass-1", orgName: "Acme IL" });
    expect(r.status).toBe(201);
    orgId = r.body.org.id;
    const me = await owner.call("GET", "/api/me");
    expect(me.status).toBe(200);
    expect(me.body.user.email).toBe("tamir@example.com");
    expect(me.body.orgs).toEqual([{ id: orgId, name: "Acme IL", role: "owner" }]);
  });

  it("rejects duplicate e-mails and bad passwords", async () => {
    const dup = await client().call("POST", "/api/auth/signup", { email: "tamir@example.com", name: "X", password: "secret-pass-1", orgName: "Other" });
    expect(dup.status).toBe(409);
    const bad = await client().call("POST", "/api/auth/login", { email: "tamir@example.com", password: "wrong-password" });
    expect(bad.status).toBe(401);
    const anon = await client().call("GET", "/api/me");
    expect(anon.status).toBe(401);
  });

  it("logs out and the session stops working", async () => {
    const c = client();
    expect((await c.call("POST", "/api/auth/login", { email: "tamir@example.com", password: "secret-pass-1" })).status).toBe(200);
    expect((await c.call("GET", "/api/me")).status).toBe(200);
    expect((await c.call("POST", "/api/auth/logout")).status).toBe(200);
    expect((await c.call("GET", "/api/me")).status).toBe(401);
  });
});

describe("projects, invitations and permissions", () => {
  const owner = client();
  const guest = client();
  const editor = client();
  const contributor = client();
  let orgId: string;
  let projectId: string;
  let otherProjectId: string;
  let version: number;

  beforeAll(async () => {
    const r = await owner.call("POST", "/api/auth/signup", { email: "pm@acme.test", name: "PM", password: "secret-pass-1", orgName: "Acme" });
    orgId = r.body.org.id;
  });

  it("creates projects and validates the schedule on save", async () => {
    const r = await owner.call("POST", `/api/orgs/${orgId}/projects`, { name: "Bridge", data: sampleData() });
    expect(r.status).toBe(201);
    projectId = r.body.id;
    version = r.body.version;
    otherProjectId = (await owner.call("POST", `/api/orgs/${orgId}/projects`, { name: "Internal" })).body.id;

    const cyclic = { ...sampleData(), dependencies: [{ predecessorId: "a", successorId: "b" }, { predecessorId: "b", successorId: "a" }] };
    const bad = await owner.call("PUT", `/api/projects/${projectId}`, { data: cyclic, version });
    expect(bad.status).toBe(400);
    expect(bad.body.code).toBe("CYCLE");
  });

  it("enforces optimistic concurrency", async () => {
    const ok = await owner.call("PUT", `/api/projects/${projectId}`, { data: sampleData(), version });
    expect(ok.status).toBe(200);
    expect(ok.body.version).toBe(version + 1);
    const stale = await owner.call("PUT", `/api/projects/${projectId}`, { data: sampleData(), version });
    expect(stale.status).toBe(409);
    version = ok.body.version;
  });

  it("invites a guest viewer who sees only that project and cannot edit", async () => {
    const inv = await owner.call("POST", `/api/orgs/${orgId}/invitations`, { email: "partner@us.test", orgRole: "guest", projectId, projectRole: "viewer" });
    expect(inv.status).toBe(201);
    const info = await client().call("GET", `/api/invitations/${inv.body.token}`);
    expect(info.body).toMatchObject({ email: "partner@us.test", orgName: "Acme", projectName: "Bridge", projectRole: "viewer", accountExists: false });

    const acc = await guest.call("POST", `/api/invitations/${inv.body.token}/accept`, { name: "US Partner", password: "secret-pass-2" });
    expect(acc.status).toBe(200);
    const list = await guest.call("GET", `/api/orgs/${orgId}/projects`);
    expect(list.body.map((p: any) => p.name)).toEqual(["Bridge"]);
    expect((await guest.call("GET", `/api/projects/${projectId}`)).body.permissions).toMatchObject({ edit: false, export: false, manageMembers: false });
    expect((await guest.call("GET", `/api/projects/${otherProjectId}`)).status).toBe(404);
    expect((await guest.call("PUT", `/api/projects/${projectId}`, { data: sampleData(), version })).status).toBe(403);
    expect((await guest.call("GET", `/api/orgs/${orgId}/members`)).status).toBe(403);
    expect((await guest.call("POST", `/api/orgs/${orgId}/projects`, { name: "Nope" })).status).toBe(403);
    // the token is single-use
    expect((await client().call("GET", `/api/invitations/${inv.body.token}`)).status).toBe(404);
  });

  it("lets a member editor edit, and a project manager invite guests but not manage the org", async () => {
    const inv = await owner.call("POST", `/api/orgs/${orgId}/invitations`, { email: "dev@acme.test", orgRole: "member", projectId, projectRole: "editor" });
    await editor.call("POST", `/api/invitations/${inv.body.token}/accept`, { name: "Dev", password: "secret-pass-3" });
    const r = await editor.call("PUT", `/api/projects/${projectId}`, { data: sampleData(), version });
    expect(r.status).toBe(200);
    version = r.body.version;
    expect((await editor.call("PUT", `/api/projects/${projectId}/members/x`, { role: "viewer" })).status).toBe(403);
    // members may create their own projects and become their managers
    const own = await editor.call("POST", `/api/orgs/${orgId}/projects`, { name: "Dev's project" });
    expect(own.status).toBe(201);
    const invite = await editor.call("POST", `/api/orgs/${orgId}/invitations`, { email: "x@y.test", orgRole: "guest", projectId: own.body.id, projectRole: "viewer" });
    expect(invite.status).toBe(201);
    const inviteOther = await editor.call("POST", `/api/orgs/${orgId}/invitations`, { email: "x@y.test", orgRole: "guest", projectId, projectRole: "viewer" });
    expect(inviteOther.status).toBe(403);
    expect((await editor.call("POST", `/api/orgs/${orgId}/invitations`, { email: "x@y.test", orgRole: "admin" })).status).toBe(403);
    // owner sees every project, the editor only theirs
    expect((await owner.call("GET", `/api/orgs/${orgId}/projects`)).body.length).toBe(3);
    expect((await editor.call("GET", `/api/orgs/${orgId}/projects`)).body.map((p: any) => p.name).sort()).toEqual(["Bridge", "Dev's project"]);
  });

  it("restricts contributors to progress on their own tasks", async () => {
    const inv = await owner.call("POST", `/api/orgs/${orgId}/invitations`, { email: "worker@acme.test", orgRole: "member", projectId, projectRole: "contributor" });
    const acc = await contributor.call("POST", `/api/invitations/${inv.body.token}/accept`, { name: "Worker", password: "secret-pass-4" });
    const workerId = acc.body.user.id as string;
    // assign task "a" to the worker (as owner)
    const assigned = sampleData();
    (assigned.tasks[0] as any).assigneeId = workerId;
    const r = await owner.call("PUT", `/api/projects/${projectId}`, { data: assigned, version });
    version = r.body.version;

    const progress = structuredClone(assigned);
    (progress.tasks[0] as any).percentComplete = 50;
    const ok = await contributor.call("PUT", `/api/projects/${projectId}`, { data: progress, version });
    expect(ok.body).toEqual({ version: expect.any(Number) });
    expect(ok.status).toBe(200);
    version = ok.body.version;

    const otherTask = structuredClone(progress);
    (otherTask.tasks[1] as any).percentComplete = 10;
    expect((await contributor.call("PUT", `/api/projects/${projectId}`, { data: otherTask, version })).status).toBe(403);

    const reschedule = structuredClone(progress);
    (reschedule.tasks[0] as any).duration = 5 * D;
    expect((await contributor.call("PUT", `/api/projects/${projectId}`, { data: reschedule, version })).status).toBe(403);
  });

  it("manages org roles with owner safeguards and records an audit trail", async () => {
    const members = await owner.call("GET", `/api/orgs/${orgId}/members`);
    expect(members.status).toBe(200);
    const dev = members.body.find((m: any) => m.email === "dev@acme.test");
    const ownerRow = members.body.find((m: any) => m.email === "pm@acme.test");
    expect((await owner.call("PATCH", `/api/orgs/${orgId}/members/${dev.id}`, { role: "admin" })).status).toBe(200);
    // the new admin sees all projects and the audit log, but cannot demote the last owner
    expect((await editor.call("GET", `/api/orgs/${orgId}/projects`)).body.length).toBe(3);
    expect((await editor.call("PATCH", `/api/orgs/${orgId}/members/${ownerRow.id}`, { role: "member" })).status).toBe(403);
    expect((await owner.call("PATCH", `/api/orgs/${orgId}/members/${ownerRow.id}`, { role: "member" })).status).toBe(409);
    expect((await owner.call("DELETE", `/api/orgs/${orgId}/members/${ownerRow.id}`)).status).toBe(409);
    const audit = await owner.call("GET", `/api/orgs/${orgId}/audit`);
    expect(audit.status).toBe(200);
    const actions = audit.body.map((e: any) => e.action);
    expect(actions).toEqual(expect.arrayContaining(["org.create", "project.create", "project.update", "invitation.create", "invitation.accept", "org.member.role"]));
    expect((await guest.call("GET", `/api/orgs/${orgId}/audit`)).status).toBe(403);
  });

  it("soft-deletes projects", async () => {
    expect((await editor.call("DELETE", `/api/projects/${otherProjectId}`)).status).toBe(200); // editor is admin now
    expect((await owner.call("GET", `/api/projects/${otherProjectId}`)).status).toBe(404);
  });
});
