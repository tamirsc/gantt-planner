# @gantt-planner/engine

Pure, deterministic project scheduling engine in TypeScript. No DOM, no database, no I/O:
the same code runs in the browser (instant feedback while editing) and on the server
(source of truth).

## What it does today

- **Calendars**: weekday working intervals, exceptions (holidays, special hours), presets for
  Israel (Sun–Thu), Standard (Mon–Fri) and 24 hours. Working-time arithmetic: add/subtract
  minutes, next/previous working time, working minutes between instants.
- **Tasks**: unlimited WBS hierarchy with computed summary tasks and WBS codes, milestones,
  per-task calendars, auto or manual scheduling mode.
- **Dependencies**: FS, SS, FF, SF with positive or negative lag measured in working time.
  Dependencies on summary tasks are inherited by their subtasks (MS Project semantics for
  FS/SS; FF/SF are approximated and flagged).
- **Constraints**: ASAP, ALAP, SNET, SNLT, FNET, FNLT, MSO, MFO, plus deadlines.
- **CPM**: forward pass (early dates), backward pass (late dates), total and free slack,
  critical path with configurable slack threshold. Forcing constraints that conflict with
  dependencies produce negative slack and a warning, as in MS Project.
- **Resources and assignments**: work, material and cost resources with rates, cost per use,
  max units and their own calendars. Work = duration × units for work resources; task and
  summary work/cost roll up; per-day load against each resource's own calendar flags
  overallocation (a US resource on an Israeli Sunday, two full-time tasks on one person).
- **Task types**: fixed units / fixed duration / fixed work and effort-driven editing helpers
  (`setTaskDuration`, `setTaskWork`, `setAssignmentUnits`, `assignResource`, `unassignResource`)
  that keep Duration × Units = Work consistent the way MS Project does.
- **Baselines**: up to eleven snapshots (`takeBaseline`), with start/finish/work/cost variances
  against baseline 0 on every scheduled task.
- **Validation**: duplicate ids, unknown references, dependency cycles (the offending cycle is
  reported), parent/child cycles, assignments to unknown tasks or resources.

## Usage

```ts
import { schedule, utc, fmt } from "@gantt-planner/engine";

const result = schedule({
  start: utc("2026-11-01"),
  tasks: [
    { id: "design", name: "Design", duration: 2 * 480 },
    { id: "build", name: "Build", duration: 5 * 480 },
    { id: "ship", name: "Ship" }, // milestone
  ],
  dependencies: [
    { predecessorId: "design", successorId: "build" },
    { predecessorId: "build", successorId: "ship", lag: 480 },
  ],
});

console.log(fmt(result.projectFinish), result.criticalPath);
```

Durations and lags are **working minutes**. Use `WorkCalendar#days(n)` to convert days.
Dates are epoch milliseconds in project time (UTC arithmetic); the application layer maps a
user's local time onto that scale.

## Assumptions to verify with golden tests

These follow MS Project as far as we know, and will be checked against `.xml` files exported
from MS Project once the MSPDI package exists:

- Lag is measured in the **successor's** calendar by default (`options.lagCalendar`).
- A milestone that follows a task sits at the predecessor's finish instant (e.g. 17:00), not
  at the next working morning.
- A summary task's predecessor is applied as a start floor to every subtask.
- ALAP tasks are pinned to their late dates and the schedule is recomputed once.

## Not yet

Tracking (actual dates, status date, remaining work), resource leveling, earned value,
work contours and timephased data, incremental recomputation. A 10,000-task chain schedules in
about 200 ms and a 2,000-task project with summaries in about 50 ms; the target is under 100 ms
for the chain.
