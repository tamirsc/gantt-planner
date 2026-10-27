import { israelStandard, standardMonFri, utc, type ProjectInput } from "@gantt-planner/engine";

const D = 480;

/** Demo project: an Israeli team delivering with a US partner, mixed Hebrew/English names. */
export function sampleProject(): ProjectInput {
  return {
    start: utc("2026-11-01"),
    calendarId: israelStandard.id,
    calendars: [
      {
        ...israelStandard,
        exceptions: [{ name: "חג לדוגמה", from: "2026-11-09", intervals: [] }],
      },
      standardMonFri,
    ],
    tasks: [
      { id: "t1", name: "אפיון ותכנון" },
      { id: "t2", name: "איסוף דרישות מהלקוח", parentId: "t1", duration: 3 * D },
      { id: "t3", name: "כתיבת מסמך אפיון (PRD)", parentId: "t1", duration: 4 * D },
      { id: "t4", name: "אישור אפיון", parentId: "t1", duration: 0 },
      { id: "t5", name: "פיתוח" },
      { id: "t6", name: "Backend API", parentId: "t5", duration: 8 * D },
      { id: "t7", name: "ממשק משתמש (React)", parentId: "t5", duration: 7 * D },
      { id: "t8", name: "US partner: payment integration", parentId: "t5", duration: 5 * D, calendarId: standardMonFri.id },
      { id: "t9", name: "בדיקות ושחרור" },
      { id: "t10", name: "QA cycle 1", parentId: "t9", duration: 3 * D },
      { id: "t11", name: "תיקוני באגים", parentId: "t9", duration: 2 * D },
      { id: "t12", name: "Go-live", parentId: "t9", duration: 0, deadline: utc("2026-12-17T17:00") },
    ],
    dependencies: [
      { predecessorId: "t2", successorId: "t3" },
      { predecessorId: "t3", successorId: "t4" },
      { predecessorId: "t4", successorId: "t6" },
      { predecessorId: "t4", successorId: "t7", lag: 2 * D },
      { predecessorId: "t4", successorId: "t8" },
      { predecessorId: "t6", successorId: "t10" },
      { predecessorId: "t7", successorId: "t10" },
      { predecessorId: "t8", successorId: "t10", type: "FF", lag: -1 * D },
      { predecessorId: "t10", successorId: "t11" },
      { predecessorId: "t11", successorId: "t12" },
    ],
  };
}
