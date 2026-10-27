# @gantt-planner/server

Fastify API: accounts and sessions, organizations and projects, invitations, roles and
permissions, audit log. Projects are stored as JSON documents validated by the scheduling
engine on every save, with optimistic concurrency (version numbers).

```bash
pnpm --filter @gantt-planner/server dev      # http://localhost:3000, embedded PGlite in ./data/pglite
pnpm --filter @gantt-planner/server test     # API tests against an in-memory PGlite
```

Set `DATABASE_URL` to use Postgres; migrations in `migrations/*.sql` run automatically on start.

## Permission model

Organization roles: **owner**, **admin**, **member**, **guest**. Project roles: **manager**,
**editor**, **contributor**, **viewer**. Owners and admins implicitly manage every project.
Guests (external partners) exist only inside the projects they were invited to. Contributors can
change only `percentComplete` and `notes` on tasks whose `assigneeId` is their own user id.
The single decision point is `can(actor, action)` in `src/policy.ts`; every route calls it.

## API

| Method | Path | Who |
|---|---|---|
| POST | `/api/auth/signup` `{email,name,password,orgName}` | anyone; creates an organization and its owner |
| POST | `/api/auth/login`, `/api/auth/logout` | anyone |
| GET | `/api/me` | signed in |
| GET | `/api/orgs/:orgId/members` | admin |
| PATCH / DELETE | `/api/orgs/:orgId/members/:userId` | admin (owner changes need an owner; the last owner is protected) |
| POST | `/api/orgs/:orgId/invitations` `{email,orgRole,projectId?,projectRole?}` | admin; a project manager may invite guests/members into their own project |
| GET | `/api/invitations/:token` | anyone (what the invitation is for) |
| POST | `/api/invitations/:token/accept` `{name?,password?}` | anyone; creates the account when needed and signs in |
| GET / POST | `/api/orgs/:orgId/projects` | members (list shows only one's own projects unless admin) |
| GET / PUT / DELETE | `/api/projects/:id` | by project role; PUT needs `{data, version}` and answers 409 on a stale version, 400 on a schedule error such as a cycle |
| GET / PUT / DELETE | `/api/projects/:id/members[/:userId]` | manager |
| GET | `/api/orgs/:orgId/audit` | admin |
| GET | `/api/health` | anyone |

Invitation tokens are returned to the caller for now; e-mail delivery arrives with the
notification service. Organization sign-in (OIDC) is planned after the pilot.

## Deployment

The root `Dockerfile` builds every package and serves the API together with the built web app
from one container (`railway.json` points Railway at it). Required environment: `DATABASE_URL`,
`COOKIE_SECRET`. See `.env.example`.
