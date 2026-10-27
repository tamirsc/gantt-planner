# Golden fixtures

Every `*.xml` file in this folder is read by `test/golden.test.ts`, scheduled with the engine, and the
computed Start, Finish, TotalSlack and Critical values are compared with the values stored in the file.

The current fixtures were written by hand following the MSPDI schema, with expected values derived by
hand. **They prove consistency, not MS Project parity.** To validate parity, save a project from
Microsoft Project as XML (File → Save As → XML Format) and drop it here: the test picks it up with no
further changes. Good candidates: all four link types with lag and lead, a non-standard calendar with
holidays, a task on its own calendar, summary tasks with their own predecessors, each constraint type,
a deadline, a manually scheduled task, an ALAP task.
