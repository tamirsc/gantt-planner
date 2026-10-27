import { useSyncExternalStore } from "react";

export type Route =
  | { name: "projects" }
  | { name: "project"; id: string }
  | { name: "members" }
  | { name: "invite"; token: string }
  | { name: "login" }
  | { name: "signup" };

function parse(path: string): Route {
  const parts = path.replace(/\/+$/, "").split("/").filter(Boolean);
  if (parts.length === 0) return { name: "projects" };
  if (parts[0] === "projects" && parts[1]) return { name: "project", id: parts[1] };
  if (parts[0] === "members") return { name: "members" };
  if (parts[0] === "invite" && parts[1]) return { name: "invite", token: parts[1] };
  if (parts[0] === "login") return { name: "login" };
  if (parts[0] === "signup") return { name: "signup" };
  return { name: "projects" };
}

const listeners = new Set<() => void>();
window.addEventListener("popstate", () => listeners.forEach((l) => l()));

export function navigate(path: string, replace = false): void {
  if (replace) history.replaceState(null, "", path);
  else history.pushState(null, "", path);
  listeners.forEach((l) => l());
}

export function useRoute(): Route {
  const path = useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => location.pathname,
  );
  return parse(path);
}

export const pathFor = {
  projects: () => "/",
  project: (id: string) => `/projects/${id}`,
  members: () => "/members",
  invite: (token: string) => `/invite/${token}`,
  login: () => "/login",
  signup: () => "/signup",
};
