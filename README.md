# Gantt Planner

Collaborative, bilingual, MS Project-class project scheduling for the web.

אפליקציית ניהול פרויקטים שיתופית ודו-לשונית ברמת MS Project: מנוע תזמון אמיתי (נתיב קריטי, לוחות שנה, תלויות, אילוצים, baselines, משאבים), ייבוא וייצוא לקבצי MS Project ו-Primavera, ותרגום תוכן לכל משתמש.

הסקירה המלאה של השוק והמוצר: [docs/project-app-overview.md](docs/project-app-overview.md).

## Packages

| Package | Status | Purpose |
|---|---|---|
| [`packages/engine`](packages/engine) | in progress | Pure TypeScript scheduling engine (runs in browser and server) |
| [`packages/mspdi`](packages/mspdi) | in progress | MS Project XML (MSPDI) reader/writer + golden tests against `.xml` files |
| [`packages/web`](packages/web) | in progress | React Gantt + grid app, i18n (real-time collaboration planned) |
| `services/mpxj` | planned | Small Java service wrapping MPXJ for `.mpp` / `.xer` import |

## Development

```bash
pnpm install
pnpm build        # builds every package (mspdi's typecheck resolves engine through its dist)
pnpm -r typecheck
pnpm test
pnpm --filter @gantt-planner/web dev   # run the app on http://localhost:5173
```

Node 22 and pnpm 10 are expected.

## Roadmap (short)

1. Engine core: calendars, FS/SS/FF/SF + lag, constraints, CPM, slack, critical path. ✔
2. MSPDI XML import/export and golden tests against files produced by MS Project. ✔ (waiting for real MS Project files for parity checks)
3. Web MVP: Gantt + grid, Hebrew/English UI, import/export. **← now** (first version done; Kanban and real-time editing next)
4. Resources, assignments, baselines, tracking.
5. Per-user content translation, `.mpp` / `.xer` import, reports.
