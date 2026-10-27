import { useState } from "react";
import { api } from "../api";
import { t } from "../i18n";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";

export function AuthScreen({ mode }: { mode: "login" | "signup" }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [orgName, setOrgName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signup") await api.signup({ email, name, password, orgName, locale: lang });
      else await api.login({ email, password });
      await s.refreshSession();
      navigate(pathFor.projects(), true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={(e) => void submit(e)}>
        <h1>{t(lang, "appTitle")}</h1>
        <h2>{t(lang, mode)}</h2>
        {mode === "signup" && (
          <>
            <label>
              {t(lang, "yourName")}
              <input dir="auto" value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
            </label>
            <label>
              {t(lang, "orgName")}
              <input dir="auto" value={orgName} onChange={(e) => setOrgName(e.target.value)} required autoComplete="organization" />
            </label>
          </>
        )}
        <label>
          {t(lang, "email")}
          <input type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
        </label>
        <label>
          {t(lang, "password")}
          <input type="password" dir="ltr" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8} autoComplete={mode === "signup" ? "new-password" : "current-password"} />
        </label>
        {error && <div className="form-error">{error}</div>}
        <button type="submit" className="primary" disabled={busy}>
          {mode === "signup" ? t(lang, "createAccount") : t(lang, "login")}
        </button>
        <a
          href={mode === "signup" ? pathFor.login() : pathFor.signup()}
          onClick={(e) => {
            e.preventDefault();
            navigate(mode === "signup" ? pathFor.login() : pathFor.signup());
          }}
        >
          {mode === "signup" ? t(lang, "haveAccount") : t(lang, "noAccount")}
        </a>
        <button type="button" className="link" onClick={() => s.setPrefs({ lang: lang === "he" ? "en" : "he" })}>
          {t(lang, "language")}
        </button>
      </form>
    </div>
  );
}
