import type { OrgRole, ProjectRole } from "./db/schema.js";

export type Action =
  | "org.read" // see the organization (name, own membership)
  | "org.list_members"
  | "org.manage_members" // invite, change roles, remove
  | "org.manage_settings"
  | "org.delete"
  | "org.create_project"
  | "org.list_all_projects" // see every project, not only the ones one is a member of
  | "org.read_audit"
  | "project.read"
  | "project.edit" // tasks, dependencies, calendars, name
  | "project.update_own_tasks" // progress and notes on tasks assigned to me
  | "project.manage_members"
  | "project.invite_guest"
  | "project.export"
  | "project.baseline"
  | "project.delete";

export interface Actor {
  orgRole: OrgRole | null;
  projectRole: ProjectRole | null;
  isSuperadmin?: boolean;
}

const ORG_ADMIN_ACTIONS: ReadonlySet<Action> = new Set<Action>([
  "org.read",
  "org.list_members",
  "org.manage_members",
  "org.manage_settings",
  "org.create_project",
  "org.list_all_projects",
  "org.read_audit",
  "project.read",
  "project.edit",
  "project.update_own_tasks",
  "project.manage_members",
  "project.invite_guest",
  "project.export",
  "project.baseline",
  "project.delete",
]);

const PROJECT_ROLE_ACTIONS: Record<ProjectRole, ReadonlySet<Action>> = {
  manager: new Set<Action>([
    "project.read",
    "project.edit",
    "project.update_own_tasks",
    "project.manage_members",
    "project.invite_guest",
    "project.export",
    "project.baseline",
    "project.delete",
  ]),
  editor: new Set<Action>(["project.read", "project.edit", "project.update_own_tasks", "project.export"]),
  contributor: new Set<Action>(["project.read", "project.update_own_tasks"]),
  viewer: new Set<Action>(["project.read"]),
};

/**
 * Single authorization decision point. Every route calls this; the UI only hides.
 * Org owners and admins implicitly hold the manager role on every project.
 * Guests hold no organization-level rights beyond the projects they belong to.
 */
export function can(actor: Actor, action: Action): boolean {
  if (actor.isSuperadmin) return true;
  const { orgRole, projectRole } = actor;
  if (orgRole === null) return false;
  if (orgRole === "owner") return true;
  if (orgRole === "admin") return ORG_ADMIN_ACTIONS.has(action);
  if (orgRole === "member") {
    if (action === "org.read" || action === "org.list_members" || action === "org.create_project") return true;
  }
  // member and guest: project-level rights only
  if (projectRole !== null && PROJECT_ROLE_ACTIONS[projectRole].has(action)) return true;
  return false;
}

export const ORG_ROLES: readonly OrgRole[] = ["owner", "admin", "member", "guest"];
export const PROJECT_ROLES: readonly ProjectRole[] = ["manager", "editor", "contributor", "viewer"];
