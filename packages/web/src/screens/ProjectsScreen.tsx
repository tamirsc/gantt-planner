import { useEffect, useRef, useState } from "react";
import { readMspdi } from "@gantt-planner/mspdi";
import { api, type ProjectSummary } from "../api";
import { roleLabel, t } from "../i18n";
import { fmtDateTime } from "../lib/format";
import { navigate, pathFor } from "../router";
import { sampleProject } from "../sample";
import { useStore } from "../store";
import { UserMenu } from "../components/UserMenu";

export function ProjectsScreen() {
  const s = useStore();
  const lang = s.prefs.lang;
  const orgId = s.currentOrgId;
  const org = s.session?.orgs.find((o) => o.id === orgId);
  const [projects, setProjects] = useState<ProjectSummary[] | null>(null);
  const [name, setName] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const isAdmin = org?.role === "owner" || org?.role === "admin";
  const canCreate = isAdmin || org?.role === "member";

  const reload = () => {
    if (!orgId) return;
    api.listProjects(orgId).then(setProjects, (e: Error) => s.setToast(e.message));
  };
  useEffect(reload, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const create = async (data?: ReturnType<typeof sampleProject>, projectName?: string) => {
    if (!orgId) return;
    const n = (projectName ?? name).trim();
    if (!n) return;
    try {
      const p = await api.createProject(orgId, data ? { name: n, data } : { name: n });
      navigate(pathFor.project(p.id));
    } catch (e) {
      s.setToast((e as Error).message);
    }
  };

  const importXml = async (file: File) => {
    try {
      const doc = readMspdi(await file.text());
      await create(doc.project, doc.name || file.name.replace(/\.xml$/i, ""));
    } catch (e) {
      s.setToast(`${t(lang, "importError")} ${(e as Error).message}`);
    }
  };

  return (
    <div className="page">
      <header className="toolbar">
        <div className="brand">
          <strong>{t(lang, "appTitle")}</strong>
          {s.session && s.session.orgs.length > 1 ? (
            <select value={orgId ?? ""} onChange={(e) => s.setCurrentOrg(e.target.value)}>
              {s.session.orgs.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          ) : (
            <span className="muted" dir="auto">{org?.name}</span>
          )}
        </div>
        <div className="group">
          {isAdmin && <button onClick={() => navigate(pathFor.members())}>{t(lang, "orgMembers")}</button>}
        </div>
        <UserMenu />
      </header>
      <main className="page-body">
        <h2>{t(lang, "projects")}</h2>
        {canCreate && (
          <form
            className="row"
            onSubmit={(e) => {
              e.preventDefault();
              void create();
            }}
          >
            <input dir="auto" placeholder={t(lang, "newProjectName")} value={name} onChange={(e) => setName(e.target.value)} />
            <button type="submit" className="primary" disabled={!name.trim()}>
              {t(lang, "create")}
            </button>
            <button type="button" onClick={() => void create(sampleProject(), t(lang, "sample"))}>
              {t(lang, "createSample")}
            </button>
            <button type="button" onClick={() => fileRef.current?.click()}>
              {t(lang, "importAsNew")}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".xml,text/xml,application/xml"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importXml(f);
                e.target.value = "";
              }}
            />
          </form>
        )}
        {projects === null ? (
          <p>{t(lang, "loading")}</p>
        ) : projects.length === 0 ? (
          <p className="muted">{t(lang, "noProjects")}</p>
        ) : (
          <table className="list">
            <thead>
              <tr>
                <th>{t(lang, "newProjectName")}</th>
                <th>{t(lang, "role")}</th>
                <th>{t(lang, "updated")}</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {projects.map((p) => (
                <tr key={p.id} onClick={() => navigate(pathFor.project(p.id))}>
                  <td dir="auto">{p.name}</td>
                  <td>{roleLabel(lang, p.role)}</td>
                  <td>{fmtDateTime(lang, Date.parse(p.updatedAt))}</td>
                  <td>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(pathFor.project(p.id));
                      }}
                    >
                      {t(lang, "open")}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </main>
    </div>
  );
}
