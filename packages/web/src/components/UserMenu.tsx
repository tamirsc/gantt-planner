import { useEffect, useRef, useState } from "react";
import { LANGS, LANG_NAMES, roleLabel, t, type Lang } from "../i18n";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";

/** The signed-in user's menu: account, language, organization admin (when allowed), sign out. */
export function UserMenu() {
  const s = useStore();
  const lang = s.prefs.lang;
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const org = s.session?.orgs.find((o) => o.id === s.currentOrgId);
  const isAdmin = org?.role === "owner" || org?.role === "admin";

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  if (!s.session) return null;
  const user = s.session.user;
  const initials = user.name
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("");

  return (
    <div className="user-menu" ref={ref}>
      <button className="user-button" onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} title={user.email}>
        <span className="avatar">{initials || "?"}</span>
        <span dir="auto">{user.name}</span>
        <span className="caret">▾</span>
      </button>
      {open && (
        <div className="menu" role="menu">
          <div className="menu-head">
            <div dir="auto">
              <b>{user.name}</b>
            </div>
            <div className="muted" dir="ltr">
              {user.email}
            </div>
            {org && (
              <div className="muted" dir="auto">
                {org.name} · {roleLabel(lang, org.role)}
              </div>
            )}
          </div>
          <label className="menu-field">
            <span>{t(lang, "language")}</span>
            <select value={lang} onChange={(e) => s.setPrefs({ lang: e.target.value as Lang })}>
              {LANGS.map((l) => (
                <option key={l} value={l}>
                  {LANG_NAMES[l]}
                </option>
              ))}
            </select>
          </label>
          {isAdmin && (
            <button role="menuitem" onClick={() => { setOpen(false); navigate(pathFor.members()); }}>
              {t(lang, "orgMembers")}
            </button>
          )}
          <button role="menuitem" className="danger" onClick={() => void s.signOut().then(() => navigate(pathFor.login(), true))}>
            {t(lang, "logout")}
          </button>
        </div>
      )}
    </div>
  );
}
