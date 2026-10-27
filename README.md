# Gantt Planner

Collaborative, bilingual, MS Project-class project scheduling for the web.

אפליקציית ניהול פרויקטים שיתופית ודו-לשונית ברמת MS Project: מנוע תזמון אמיתי (נתיב קריטי, לוחות שנה, תלויות, אילוצים, baselines, משאבים), ייבוא וייצוא לקבצי MS Project ו-Primavera, ותרגום תוכן לכל משתמש.

הסקירה המלאה של השוק והמוצר: [docs/project-app-overview.md](docs/project-app-overview.md).

## Packages

| Package | Status | Purpose |
|---|---|---|
| [`packages/engine`](packages/engine) | in progress | Pure TypeScript scheduling engine (runs in browser and server) |
| `packages/mspdi` | planned | MS Project XML (MSPDI) reader/writer + golden tests against real `.xml` files |
| `packages/web` | planned | React Gantt + grid app, real-time collaboration, i18n |
| `services/mpxj` | planned | Small Java service wrapping MPXJ for `.mpp` / `.xer` import |

## Development

```bash
pnpm install
pnpm typecheck
pnpm test
```

Node 22 and pnpm 10 are expected.

## Roadmap (short)

1. Engine core: calendars, FS/SS/FF/SF + lag, constraints, CPM, slack, critical path. **← now**
2. MSPDI XML import/export and golden tests against files produced by MS Project.
3. Resources, assignments, baselines, tracking.
4. Web MVP: Gantt + grid, Kanban, real-time editing, Hebrew/English UI.
5. Per-user content translation, `.mpp` / `.xer` import, reports.
