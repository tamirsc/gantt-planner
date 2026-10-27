import { describe, expect, it } from "vitest";
import { can, type Action } from "../src/policy.js";

const actions: Action[] = [
  "org.read",
  "org.list_members",
  "org.manage_members",
  "org.delete",
  "org.create_project",
  "org.list_all_projects",
  "org.read_audit",
  "project.read",
  "project.edit",
  "project.update_own_tasks",
  "project.manage_members",
  "project.invite_guest",
  "project.export",
  "project.delete",
];

const allowed = (orgRole: Parameters<typeof can>[0]["orgRole"], projectRole: Parameters<typeof can>[0]["projectRole"]) =>
  actions.filter((a) => can({ orgRole, projectRole }, a));

describe("policy matrix", () => {
  it("owner can do everything", () => {
    expect(allowed("owner", null)).toEqual(actions);
  });
  it("admin can do everything except delete the organization", () => {
    expect(allowed("admin", null)).toEqual(actions.filter((a) => a !== "org.delete"));
  });
  it("member without a project role sees the org and can create projects", () => {
    expect(allowed("member", null)).toEqual(["org.read", "org.list_members", "org.create_project"]);
  });
  it("guest without a project role can do nothing", () => {
    expect(allowed("guest", null)).toEqual([]);
  });
  it("guest viewer can only read the project", () => {
    expect(allowed("guest", "viewer")).toEqual(["project.read"]);
  });
  it("guest editor can read, edit and export but not manage members", () => {
    expect(allowed("guest", "editor")).toEqual(["project.read", "project.edit", "project.update_own_tasks", "project.export"]);
  });
  it("contributor can only update own tasks", () => {
    expect(allowed("member", "contributor")).toContain("project.update_own_tasks");
    expect(allowed("member", "contributor")).not.toContain("project.edit");
  });
  it("project manager who is a plain member manages the project but not the org", () => {
    const a = allowed("member", "manager");
    expect(a).toContain("project.delete");
    expect(a).toContain("project.invite_guest");
    expect(a).not.toContain("org.manage_members");
    expect(a).not.toContain("org.list_all_projects");
  });
  it("non-members are denied everything; superadmins get everything", () => {
    expect(allowed(null, null)).toEqual([]);
    expect(actions.every((a) => can({ orgRole: null, projectRole: null, isSuperadmin: true }, a))).toBe(true);
  });
});
