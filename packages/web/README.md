# @gantt-planner/web

React + Vite front end: a task grid and a Gantt timeline on top of `@gantt-planner/engine`, with
MS Project XML import/export from `@gantt-planner/mspdi`.

```bash
pnpm --filter @gantt-planner/web dev      # http://localhost:5173
pnpm --filter @gantt-planner/web build
```

## Screens

Sign in / sign up, invitation acceptance, project list (create, sample, import XML as a new
project), organization admin (members, roles, invitations, audit log) and the project editor
with a members & permissions panel. Projects are loaded from and autosaved to the server
(`@gantt-planner/server`); a save that collides with someone else's reloads their version and
says so. Viewers get a read-only editor, contributors can edit only the progress of tasks assigned
to them, and the server enforces all of it regardless of the UI.

## What works

- **Grid**: row number, WBS, name, duration, start, finish, predecessors (MS Project syntax such as
  `3FS+2d; 5SS-1d`), total slack. Inline editing, collapse/expand of summaries, multi-select
  (click, Shift, Ctrl).
- **Gantt**: month/week/day headers, non-working days shaded from the project calendar, summary
  brackets, milestones, deadlines, today line, dependency arrows for all four link types, critical
  path highlighting. Drag a bar to move it (sets a Start No Earlier Than constraint, as MS Project
  does), drag its end to resize, drag the circle at its end onto another row to create an FS link.
- **Editing model**: every change goes through the engine; a change that would create a cycle is
  rejected with a message. Undo/redo (Ctrl+Z / Ctrl+Y), Delete and Insert keys, autosave to
  localStorage.
- **Bilingual**: Hebrew (RTL UI) and English (LTR UI) switchable at any time; task names render
  with correct bidi in both. The timeline direction is a separate preference (LTR by default, RTL
  optional), as decided in the product overview.
- **Files**: Import MS Project XML, export XML that MS Project opens directly.

## Resources, baselines and tracking

- **Resource sheet** (toolbar → Resources): name, type (work / material / cost), max units, hourly
  rate, calendar, computed work and cost; overallocated resources are flagged with the number of
  days. Unknown names typed into a task's Resources cell become work resources automatically.
- **Resources column** in MS Project syntax: `Dana[50%]; Contractor; Concrete[10]`; **Work** and
  **Cost** columns roll up to summaries and to the project total in the toolbar.
- **Baseline**: Set/Clear baseline in the toolbar; grey baseline bars under each task in the Gantt
  and Start/Finish variance columns in the grid (late ones in red).
- **Status date**: a date picker in the toolbar draws the status line in the Gantt; the ⇥ option
  moves remaining work after the status date. Percent complete rolls up to summaries and the
  project; with a baseline the toolbar shows SPI and CPI.
- The grid scrolls horizontally with the #, WBS and name columns pinned; the splitter between grid
  and Gantt is draggable.

## Rendering choice

The Gantt is our own SVG renderer rather than a third-party component. It keeps full control over
bidi text inside bars, axis direction, critical-path styling and the drag semantics tied to the
engine, and it has no licensing or upgrade dependency. Virtualization for very large projects is
not implemented yet (the renderer draws every visible row).

## End-to-end test

`e2e/smoke.cjs` drives a real browser against a running server: sign-up, project creation,
editing with autosave, guest invitation (read-only), contributor (progress only), organization
admin, sign-out. CI runs it; locally:

```bash
pnpm build
(cd packages/server && PGLITE_DIR=/tmp/pglite WEB_DIST=$PWD/../web/dist COOKIE_SECRET=x node dist/main.js &)
(cd packages/web && node e2e/smoke.cjs)
```

## Not yet

Task type and effort-driven controls in the UI, resource usage view (per-day histogram), Kanban,
real-time collaboration (today the last save wins after a conflict reload), per-user content
translation, e-mail delivery of invitations, column customization, printing/PDF, keyboard
navigation inside the grid, virtualization.
