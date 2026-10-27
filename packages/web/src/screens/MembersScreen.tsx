import { useEffect, useState } from "react";
import { api, type MemberRow, type OrgRole } from "../api";
import { roleLabel, t } from "../i18n";
import { fmtDateTime } from "../lib/format";
import { navigate, pathFor } from "../router";
import { useStore } from "../store";
import { InviteForm } from "../components/InviteForm";
import { UserMenu } from "../components/UserMenu";

/** Organization admin: members, roles, invitations and the audit log. */
export function MembersScreen() {
  const s = useStore();
  const lang = s.prefs.lang;
  const orgId = s.currentOrgId!;
  const org = s.session?.orgs.find((o) => o.id === orgId);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [audit, setAudit] = useState<Awaited<ReturnType<typeof api.audit>>>([]);
  const isOwner = org?.role === "owner";

  const reload = () => {
    api.orgMembers(orgId).then(setMembers, (e: Error) => s.setToast(e.message));
    api.audit(orgId).then(setAudit, () => setAudit([]));
  };
  useEffect(reload, [orgId]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = (p: Promise<unknown>) => p.then(reload, (e: Error) => s.setToast(e.message));

  return (
    <div className="page">
      <header className="toolbar">
        <div className="brand">
          <strong>{t(lang, "appTitle")}</strong>
          <span className="muted" dir="auto">{org?.name}</span>
        </div>
        <div className="group">
          <button onClick={() => navigate(pathFor.projects())}>{t(lang, "back")}</button>
        </div>
        <UserMenu />
      </header>
      <main className="page-body">
        <h2>{t(lang, "orgMembers")}</h2>
        <table className="list">
          <thead>
            <tr>
              <th>{t(lang, "yourName")}</th>
              <th>{t(lang, "email")}</th>
              <th>{t(lang, "role")}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id}>
                <td dir="auto">{m.name}</td>
                <td dir="ltr">{m.email}</td>
                <td>
                  <select
                    value={m.role}
                    disabled={m.role === "owner" && !isOwner}
                    onChange={(e) => void act(api.setOrgMember(orgId, m.id, e.target.value as OrgRole))}
                  >
                    {(["owner", "admin", "member", "guest"] as OrgRole[]).map((r) => (
                      <option key={r} value={r} disabled={r === "owner" && !isOwner}>
                        {roleLabel(lang, r)}
                      </option>
                    ))}
                  </select>
                </td>
                <td>
                  {m.role !== "owner" && m.id !== s.session?.user.id && (
                    <button onClick={() => void act(api.removeOrgMember(orgId, m.id))}>{t(lang, "remove")}</button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <h3>{t(lang, "invite")}</h3>
        <InviteForm orgId={orgId} allowOrgRoles={["member", "admin", "guest"]} onDone={reload} />
        <h3>{t(lang, "audit")}</h3>
        <table className="list audit">
          <tbody>
            {audit.map((e) => (
              <tr key={e.id}>
                <td className="muted">{fmtDateTime(lang, Date.parse(e.at))}</td>
                <td dir="ltr">{e.action}</td>
                <td dir="ltr" className="muted">{members.find((m) => m.id === e.userId)?.email ?? ""}</td>
                <td dir="ltr" className="muted detail">{e.detail ? JSON.stringify(e.detail) : ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </div>
  );
}
