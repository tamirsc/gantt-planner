import { useState } from "react";
import { api, type OrgRole, type ProjectRole } from "../api";
import { roleLabel, t } from "../i18n";
import { pathFor } from "../router";
import { useStore } from "../store";

/**
 * Invite someone by e-mail. Until e-mail delivery exists, the invitation link is shown
 * for the inviter to copy and send.
 */
export function InviteForm({ orgId, projectId, allowOrgRoles, onDone }: { orgId: string; projectId?: string; allowOrgRoles: Exclude<OrgRole, "owner">[]; onDone?: () => void }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const [email, setEmail] = useState("");
  const [orgRole, setOrgRole] = useState<Exclude<OrgRole, "owner">>(allowOrgRoles[0] ?? "guest");
  const [projectRole, setProjectRole] = useState<ProjectRole>("viewer");
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const body: Parameters<typeof api.invite>[1] = { email, orgRole };
      if (projectId) {
        body.projectId = projectId;
        body.projectRole = projectRole;
      }
      const r = await api.invite(orgId, body);
      setLink(`${location.origin}${pathFor.invite(r.token)}`);
      setEmail("");
      onDone?.();
    } catch (err) {
      s.setToast((err as Error).message);
    }
  };

  return (
    <form className="invite-form" onSubmit={(e) => void submit(e)}>
      <input type="email" dir="ltr" placeholder={t(lang, "inviteEmail")} value={email} onChange={(e) => setEmail(e.target.value)} required />
      {allowOrgRoles.length > 1 && (
        <select value={orgRole} onChange={(e) => setOrgRole(e.target.value as Exclude<OrgRole, "owner">)}>
          {allowOrgRoles.map((r) => (
            <option key={r} value={r}>
              {roleLabel(lang, r)}
            </option>
          ))}
        </select>
      )}
      {projectId && (
        <select value={projectRole} onChange={(e) => setProjectRole(e.target.value as ProjectRole)}>
          {(["manager", "editor", "contributor", "viewer"] as ProjectRole[]).map((r) => (
            <option key={r} value={r}>
              {roleLabel(lang, r)}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="primary">
        {t(lang, "invite")}
      </button>
      {link && (
        <div className="invite-link">
          <div className="muted">{t(lang, "inviteLink")}</div>
          <code dir="ltr">{link}</code>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard?.writeText(link);
              setCopied(true);
            }}
          >
            {copied ? t(lang, "copied") : t(lang, "copy")}
          </button>
        </div>
      )}
    </form>
  );
}
