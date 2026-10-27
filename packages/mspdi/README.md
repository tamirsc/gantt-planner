# @gantt-planner/mspdi

Reader and writer for **MSPDI**, the XML Data Interchange format of Microsoft Project
(`File → Save As → XML Format`). It maps the file onto the `@gantt-planner/engine` model and back,
so a project can be imported from MS Project, scheduled by our engine, and exported to a file that
MS Project opens directly.

## Usage

```ts
import { readMspdi, writeMspdi } from "@gantt-planner/mspdi";
import { schedule } from "@gantt-planner/engine";

const doc = readMspdi(xmlString);       // doc.project is engine input, doc.stored holds MS Project's own values
const result = schedule(doc.project);   // our schedule
const xml = writeMspdi(doc.project, { name: doc.name, result });
```

## What is mapped

| MSPDI | Engine |
|---|---|
| `StartDate`, `CalendarUID`, `MinutesPerDay`, `CriticalSlackLimit` | project start, project calendar, day length, critical threshold |
| `Calendar` with `WeekDays` (DayType 1 = Sunday … 7 = Saturday), `WorkingTimes`, `Exceptions`, legacy `DayType 0` exceptions, `BaseCalendarUID` inheritance | `CalendarDefinition` |
| `Task`: `UID`, `Name`, `OutlineLevel` (hierarchy), `Duration` (`PT8H0M0S`), `Milestone`, `Manual` + `ManualStart/Finish`, `ConstraintType` (0 ASAP … 7 FNLT) + `ConstraintDate`, `Deadline`, `CalendarUID`, `PercentComplete` | `TaskInput` |
| `PredecessorLink`: `Type` (0 FF, 1 FS, 2 SF, 3 SS), `LinkLag` (tenths of a minute), percent `LagFormat` | `DependencyInput` |
| `Task`: `Type` (0 fixed units, 1 fixed duration, 2 fixed work), `EffortDriven`, `FixedCost`, `Baseline` (Number, Start, Finish, Duration, Work, Cost) | task type, effort-driven flag, fixed cost, `BaselineInput` |
| `StatusDate`; task `ActualStart`, `ActualFinish`, `PercentComplete`, `Stop`, `Resume`, `ActualDuration`, `RemainingDuration`, `ActualWork`, `RemainingWork` | tracking fields (status date, actuals) |
| `Resource`: `UID`, `Name`, `Type` (0 material, 1 work, 2 cost), `MaxUnits`, `CalendarUID`, `StandardRate` + `StandardRateFormat` (daily/weekly converted to hourly), `CostPerUse` | `ResourceInput` (UID 0 "Unassigned" skipped) |
| `Assignment`: `TaskUID`, `ResourceUID`, `Units` (decimal fraction), `Work`, `Cost` | `AssignmentInput` (unassigned placeholders skipped) |
| `Start`, `Finish`, `Early*`, `Late*`, `TotalSlack`, `FreeSlack` (tenths of a minute), `Critical`, `Work`, `Cost` | returned in `doc.stored` for comparison, never used for scheduling |

Task UID 0 (project summary), `IsNull` tasks and external tasks are skipped. Recurring calendar
exceptions are applied to their first period only, elapsed durations are treated as working time,
and both cases are reported in `doc.warnings`.

## Golden tests

`fixtures/golden/*.xml` are read, scheduled and compared against the values stored in the file
(start, finish, slack, critical, outline). Drop any file saved by MS Project into that folder to
check parity; see the README there. The current fixtures are hand-written and prove internal
consistency only.

## Not yet

Actual cost and actual work values, cost rate tables and overtime, work contours, extended attributes (custom
fields), outline codes, WBS masks, timephased data, `.mpp` binary files (planned via an MPXJ
service).
