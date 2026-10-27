import type { ProjectInput } from "@gantt-planner/engine";

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly code: string | null,
  ) {
    super(message);
  }
}

async function call<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body === undefined ? {} : { "content-type": "application/json" },
    body: body === undefined ? null : JSON.stringify(body),
  });
  const text = await res.text();
  const json = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (json ?? {}) as { error?: string; code?: string | null };
    throw new ApiError(res.status, err.error ?? res.statusText, err.code ?? null);
  }
  return json as T;
}

export type OrgRole = "owner" | "admin" | "member" | "guest";
export type ProjectRole = "manager" | "editor" | "contributor" | "viewer";

export interface Me {
  user: { id: string; email: string; name: string; locale: string; isSuperadmin: boolean };
  orgs: { id: string; name: string; role: OrgRole }[];
}
export interface ProjectSummary {
  id: string;
  name: string;
  version: number;
  updatedAt: string;
  role: ProjectRole;
}
export interface ProjectDetail {
  id: string;
  orgId: string;
  name: string;
  data: ProjectInput;
  version: number;
  updatedAt: string;
  role: ProjectRole;
  permissions: { edit: boolean; updateOwnTasks: boolean; manageMembers: boolean; export: boolean; delete: boolean };
}
export interface MemberRow {
  id: string;
  email: string;
  name: string;
  role: string;
}
export interface InvitationInfo {
  email: string;
  orgName: string;
  orgRole: OrgRole;
  projectName: string | null;
  projectRole: ProjectRole | null;
  accountExists: boolean;
}

export const api = {
  me: () => call<Me>("GET", "/api/me"),
  signup: (b: { email: string; name: string; password: string; orgName: string; locale: string }) => call<{ user: Me["user"]; org: { id: string } }>("POST", "/api/auth/signup", b),
  login: (b: { email: string; password: string }) => call<{ user: Me["user"] }>("POST", "/api/auth/login", b),
  logout: () => call<{ ok: true }>("POST", "/api/auth/logout"),

  listProjects: (orgId: string) => call<ProjectSummary[]>("GET", `/api/orgs/${orgId}/projects`),
  createProject: (orgId: string, b: { name: string; data?: ProjectInput }) => call<ProjectDetail>("POST", `/api/orgs/${orgId}/projects`, b),
  getProject: (id: string) => call<ProjectDetail>("GET", `/api/projects/${id}`),
  saveProject: (id: string, b: { name?: string; data: ProjectInput; version: number }) => call<{ version: number }>("PUT", `/api/projects/${id}`, b),
  deleteProject: (id: string) => call<{ ok: true }>("DELETE", `/api/projects/${id}`),
  projectMembers: (id: string) => call<MemberRow[]>("GET", `/api/projects/${id}/members`),
  setProjectMember: (id: string, userId: string, role: ProjectRole) => call<{ ok: true }>("PUT", `/api/projects/${id}/members/${userId}`, { role }),
  removeProjectMember: (id: string, userId: string) => call<{ ok: true }>("DELETE", `/api/projects/${id}/members/${userId}`),

  orgMembers: (orgId: string) => call<MemberRow[]>("GET", `/api/orgs/${orgId}/members`),
  setOrgMember: (orgId: string, userId: string, role: OrgRole) => call<{ ok: true }>("PATCH", `/api/orgs/${orgId}/members/${userId}`, { role }),
  removeOrgMember: (orgId: string, userId: string) => call<{ ok: true }>("DELETE", `/api/orgs/${orgId}/members/${userId}`),
  invite: (orgId: string, b: { email: string; orgRole: Exclude<OrgRole, "owner">; projectId?: string; projectRole?: ProjectRole }) =>
    call<{ id: string; token: string; expiresAt: string }>("POST", `/api/orgs/${orgId}/invitations`, b),
  invitation: (token: string) => call<InvitationInfo>("GET", `/api/invitations/${token}`),
  acceptInvitation: (token: string, b: { name?: string; password?: string; locale?: string }) => call<{ orgId: string; projectId: string | null }>("POST", `/api/invitations/${token}/accept`, b),
  audit: (orgId: string) => call<{ id: number; action: string; userId: string | null; projectId: string | null; detail: unknown; at: string }[]>("GET", `/api/orgs/${orgId}/audit?limit=200`),
};
