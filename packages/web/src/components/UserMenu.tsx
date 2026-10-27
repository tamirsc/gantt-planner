import { t } from "../i18n";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";

export function UserMenu() {
  const s = useStore();
  const lang = s.prefs.lang;
  return (
    <div className="user-menu">
      <button onClick={() => s.setPrefs({ lang: lang === "he" ? "en" : "he" })}>{t(lang, "language")}</button>
      <span dir="auto" className="muted">
        {s.session?.user.name}
      </span>
      <button
        onClick={() => {
          void s.signOut().then(() => navigate(pathFor.login(), true));
        }}
      >
        {t(lang, "logout")}
      </button>
    </div>
  );
}
