import { useState } from "react";
import { api } from "../api";
import { LANGS, LANG_NAMES, t, type Lang } from "../i18n";
import { navigate, nextPath, pathFor } from "../router";
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
    // Read the destination now: once the session is set, the app's own redirect may change the URL.
    const next = nextPath() ?? pathFor.projects();
    try {
      if (mode === "signup") await api.signup({ email, name, password, orgName, locale: lang });
      else await api.login({ email, password });
      await s.refreshSession();
      if (location.pathname === "/login" || location.pathname === "/signup") navigate(next, true);
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
          href={mode === "signup" ? pathFor.login(nextPath() ?? undefined) : pathFor.signup(nextPath() ?? undefined)}
          onClick={(e) => {
            e.preventDefault();
            const next = nextPath() ?? undefined;
            navigate(mode === "signup" ? pathFor.login(next) : pathFor.signup(next));
          }}
        >
          {mode === "signup" ? t(lang, "haveAccount") : t(lang, "noAccount")}
        </a>
        <select className="lang-select" value={lang} onChange={(e) => s.setPrefs({ lang: e.target.value as Lang })} aria-label={t(lang, "language")}>
          {LANGS.map((l) => (
            <option key={l} value={l}>
              {LANG_NAMES[l]}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
