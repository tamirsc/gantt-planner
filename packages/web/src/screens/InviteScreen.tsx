import { useEffect, useState } from "react";
import { api, type InvitationInfo } from "../api";
import { roleLabel, t } from "../i18n";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";

export function InviteScreen({ token }: { token: string }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const [info, setInfo] = useState<InvitationInfo | null | "invalid">(null);
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.invitation(token).then(setInfo, () => setInfo("invalid"));
  }, [token]);

  if (info === null) return <div className="auth-wrap">{t(lang, "loading")}</div>;
  if (info === "invalid") return <div className="auth-wrap">{t(lang, "inviteInvalid")}</div>;

  const needsAccount = !info.accountExists && !s.session;
  const accept = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      const r = await api.acceptInvitation(token, needsAccount ? { name, password, locale: lang } : {});
      await s.refreshSession();
      s.setCurrentOrg(r.orgId);
      navigate(r.projectId ? pathFor.project(r.projectId) : pathFor.projects(), true);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={(e) => void accept(e)}>
        <h1>{t(lang, "appTitle")}</h1>
        <p dir="auto">
          {t(lang, "invitedTo")} <b>{info.orgName}</b> {t(lang, "asRole")} <b>{roleLabel(lang, info.orgRole)}</b>
          {info.projectName && (
            <>
              , {t(lang, "toProject")} <b>{info.projectName}</b> {t(lang, "asRole")} <b>{roleLabel(lang, info.projectRole ?? "")}</b>
            </>
          )}
          .
        </p>
        <p dir="ltr" className="muted">
          {info.email}
        </p>
        {needsAccount && (
          <>
            <label>
              {t(lang, "yourName")}
              <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} required />
            </label>
            <label>
              {t(lang, "password")}
              <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete="new-password" />
            </label>
          </>
        )}
        {info.accountExists && !s.session && (
          <p className="muted">
            <a href={pathFor.login()} onClick={(e) => { e.preventDefault(); navigate(pathFor.login()); }}>{t(lang, "login")}</a>
          </p>
        )}
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="primary" disabled={info.accountExists && !s.session}>
          {t(lang, "accept")}
        </button>
      </form>
    </div>
  );
}
