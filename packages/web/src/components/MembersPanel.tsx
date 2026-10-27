import { api, type ProjectRole } from "../api";
import { roleLabel, t } from "../i18n";
import { useStore } from "../store";
import { InviteForm } from "./InviteForm";

/** Project members and roles; managers may change roles, remove members and invite guests. */
export function MembersPanel({ orgId, onClose }: { orgId: string; onClose: () => void }) {
  const s = useStore();
  const lang = s.prefs.lang;
  const projectId = s.projectId!;
  const canManage = s.permissions.manageMembers;
  const act = (p: Promise<unknown>) => p.then(() => s.refreshMembers(), (e: Error) => s.setToast(e.message));

  return (
    <div className="panel">
      <div className="panel-head">
        <h3>{t(lang, "members")}</h3>
        <button onClick={onClose}>✕</button>
      </div>
      <table className="list">
        <tbody>
          {s.members.map((m) => (
            <tr key={m.id}>
              <td dir="auto">
                {m.name}
                <div className="muted" dir="ltr">
                  {m.email}
                </div>
              </td>
              <td>
                {canManage ? (
                  <select value={m.role} onChange={(e) => void act(api.setProjectMember(projectId, m.id, e.target.value as ProjectRole))}>
                    {(["manager", "editor", "contributor", "viewer"] as ProjectRole[]).map((r) => (
                      <option key={r} value={r}>
                        {roleLabel(lang, r)}
                      </option>
                    ))}
                  </select>
                ) : (
                  roleLabel(lang, m.role)
                )}
              </td>
              <td>{canManage && m.id !== s.session?.user.id && <button onClick={() => void act(api.removeProjectMember(projectId, m.id))}>{t(lang, "remove")}</button>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {canManage && (
        <>
          <h4>{t(lang, "invite")}</h4>
          <InviteForm orgId={orgId} projectId={projectId} allowOrgRoles={["guest", "member"]} onDone={() => void s.refreshMembers()} />
        </>
      )}
    </div>
  );
}
