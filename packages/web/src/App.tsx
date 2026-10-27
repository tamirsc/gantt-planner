import { useEffect } from "react";
import { t } from "./i18n";
import { navigate, pathFor, useRoute } from "./router";
import { AuthScreen } from "./screens/AuthScreen";
import { InviteScreen } from "./screens/InviteScreen";
import { MembersScreen } from "./screens/MembersScreen";
import { ProjectScreen } from "./screens/ProjectScreen";
import { ProjectsScreen } from "./screens/ProjectsScreen";
import { useStore } from "./store";

export function App() {
  const s = useStore();
  const lang = s.prefs.lang;
  const route = useRoute();

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "he" ? "rtl" : "ltr";
  }, [lang]);

  useEffect(() => {
    void s.bootstrap();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!s.toast) return;
    const h = setTimeout(() => s.setToast(null), 6000);
    return () => clearTimeout(h);
  }, [s.toast, s]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
      if (!s.projectId || !s.permissions.edit) return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) s.redo();
        else s.undo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        s.redo();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void s.saveNow();
      } else if (e.key === "Delete" && s.selected.length > 0) {
        s.deleteTasks(s.selected);
      } else if (e.key === "Insert") {
        s.addTask(s.selected[s.selected.length - 1] ?? null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [s]);

  // Redirects once the session state is known.
  useEffect(() => {
    if (s.session === undefined) return;
    const publicRoute = route.name === "login" || route.name === "signup" || route.name === "invite";
    if (!s.session && !publicRoute) navigate(pathFor.login(), true);
    if (s.session && (route.name === "login" || route.name === "signup")) navigate(pathFor.projects(), true);
  }, [s.session, route]);

  let screen: React.ReactNode;
  if (s.session === undefined) screen = <div className="auth-wrap">{t(lang, "loading")}</div>;
  else if (route.name === "invite") screen = <InviteScreen token={route.token} />;
  else if (!s.session) screen = <AuthScreen mode={route.name === "signup" ? "signup" : "login"} />;
  else if (route.name === "project") screen = <ProjectScreen id={route.id} />;
  else if (route.name === "members") screen = <MembersScreen />;
  else screen = <ProjectsScreen />;

  return (
    <>
      {screen}
      {s.toast && (
        <div className="toast" dir="auto" onClick={() => s.setToast(null)}>
          {s.toast}
        </div>
      )}
    </>
  );
}
