# סקירה: אפליקציית ניהול פרויקטים דמוית MS Project

**תאריך:** 27 באוקטובר 2026 (עדכון 2: תרגום תוכן לכל משתמש, RTL כהעדפה, פורמטי ייבוא/ייצוא)
**מטרת המסמך:** מחקר שוק של האפליקציות הקיימות (מסחריות וקוד פתוח), זיהוי הפערים, והצעה מפורטת למוצר שנבנה: היקף, פיצ'רים, מודל נתונים, ארכיטקטורה ותכנית שלבים.

---

## 1. תקציר מנהלים

- **השוק מתפצל לשניים.** בצד אחד כלי תזמון "כבדים" (MS Project Desktop, Primavera P6) עם מנוע תזמון אמיתי: נתיב קריטי, לוחות שנה, baselines, ויישור משאבים. בצד השני כלי SaaS שיתופיים (monday, Asana, ClickUp, Smartsheet, Wrike) שנעימים לשימוש אבל ה"גאנט" שלהם הוא בעיקר ציר זמן ויזואלי בלי מנוע תזמון מלא.
- **מיקרוסופט עצמה בתנועה.** Project for the web נסגר באוגוסט 2025 ומוזג לתוך Planner. Project Online ייסגר ב-30 בספטמבר 2026. היכולות ה"פרימיום" (תלויות, baselines, גאנט, פורטפוליו) עברו ל-Planner ברישיון Plan 1 / Plan 3 / Plan 5. אפליקציית Project Desktop נשארת, אבל היא Windows בלבד, יקרה, ולא שיתופית.
- **הכאבים החוזרים של משתמשי MS Project:** עקומת למידה תלולה, חוסר שיתופיות (קבצי .mpp עוברים במייל), מחיר גבוה למי שצריך משאבים ופורטפוליו, Windows בלבד, והתאמה חלשה ל-Agile.
- **ההזדמנות:** אפליקציית web שיתופית שבליבה **מנוע תזמון אמיתי ברמת MS Project** (CPM, לוחות שנה, 4 סוגי תלויות עם lag, אילוצים, baselines, משאבים), בחוויית משתמש מודרנית, **דו-לשונית באמת**: כל משתמש רואה את הממשק ואת תוכן הפרויקט בשפה שלו (תרגום תוכן לכל משתמש, ראו סעיף 8.3), עם RTL ו-bidi נכונים לעברית, ייבוא/ייצוא נאמן לקבצי MS Project ו-Primavera, ושכבת AI לבניית תכנית ולזיהוי סיכונים בלו"ז.
- **ההמלצה הטכנית:** לבנות את מנוע התזמון בעצמנו כספרייה TypeScript טהורה (זה הנכס המבדל), ולהשתמש בספריית גאנט MIT כנקודת פתיחה ל-UI (SVAR React Gantt). היפוך ציר הזמן ל-RTL הוא העדפת משתמש ולא דרישה ל-MVP, כי רוב הפרויקטים המשותפים עם חו"ל ינוהלו באנגלית.

---

## 2. מפת השוק

### 2.1 קטגוריות

| קטגוריה | דוגמאות | מה מאפיין אותן | חולשות |
|---|---|---|---|
| **תזמון ארגוני (Enterprise scheduling)** | MS Project Desktop/Server, Oracle Primavera P6 | מנוע CPM מלא, לוחות שנה, baselines, EVM, יישור משאבים, פורטפוליו | יקר, מורכב, לא שיתופי בזמן אמת, Windows (Project), UX ישן |
| **Microsoft Planner (פרימיום)** | Planner Plan 1/3/5 | היורש של Project for the web. גאנט, תלויות, baselines, פורטפוליו, סוכן AI "Project Manager" בפריוויו | לא תחליף 1:1 ל-Project Online; תלוי באקוסיסטם M365 |
| **פלטפורמות עבודה All-in-one** | monday.com, Asana, ClickUp, Wrike, Smartsheet | UX מצוין, שיתופיות, אוטומציות, אינטגרציות, AI | הגאנט שטחי: לרוב אין נתיב קריטי אמיתי, אין לוחות שנה לפי משאב, אין יישור משאבים; מחיר לפי מושב מצטבר מהר |
| **Gantt-first SaaS** | TeamGantt, GanttPRO, Instagantt | גאנט נוח, קל ללמידה, מחיר נמוך | חסרים baselines/EVM/משאבים מתקדמים; כלי "קטנים" |
| **קוד פתוח** | OpenProject (web), ProjectLibre (desktop), GanttProject (desktop) | חינם, self-host, ProjectLibre הכי קרוב ל-MS Project כולל פתיחת .mpp | UX מיושן; OpenProject בלי נתיב קריטי מלא; GanttProject בלי baselines |
| **כלי פיתוח** | Jira (Plans/Advanced Roadmaps), Linear | מצוינים ל-Agile, מחוברים לקוד | לא כלי תזמון; אין CPM, אין משאבים לפי יחידות |

### 2.2 מחירים אינדיקטיביים (לפי מקורות צד שלישי, לאימות מול הספק)

| מוצר | מחיר |
|---|---|
| Planner Plan 1 | 10$ למשתמש לחודש |
| Planner and Project Plan 3 | 30$ למשתמש לחודש (כולל Project Desktop, גאנט, נתיב קריטי) |
| Planner and Project Plan 5 | 55$ למשתמש לחודש (פורטפוליו, משאבים ארגוניים) |
| Project Standard 2024 (חד פעמי) | כ-680$ |
| Project Professional 2024 (חד פעמי) | כ-1,130$ |
| monday.com | 12$ (Standard) / 19$ (Pro) למשתמש לחודש, מינימום 3 מושבים |
| Asana | 10.99$ (Starter) / 24.99$ (Advanced) למשתמש לחודש |
| TeamGantt | חינם מוגבל; תוכניות בתשלום מ-24$ לחודש |
| OpenProject Cloud | מכ-6€ למשתמש לחודש, מינימום 25 משתמשים; Community חינם ב-self-host |

### 2.3 מטריצת פיצ'רים (יכולות תזמון)

| יכולת | MS Project | Planner Premium | monday / Asana | Smartsheet | OpenProject | ProjectLibre |
|---|---|---|---|---|---|---|
| WBS היררכי + summary tasks | ✔ | ✔ | חלקי | ✔ | ✔ | ✔ |
| 4 סוגי תלויות (FS/SS/FF/SF) + lag | ✔ | ✔ | FS בלבד ברוב המקרים | ✔ | FS/SS בעיקר | ✔ |
| נתיב קריטי (CPM) | ✔ | ✔ | חלקי/בתוספים | ✔ | חלקי | ✔ |
| לוחות שנה (פרויקט/משאב/משימה) | ✔ | חלקי | ✗ | חלקי | חלקי | ✔ |
| אילוצי תאריך (ASAP, MSO, FNLT...) | ✔ | חלקי | ✗ | ✗ | ✗ | ✔ |
| Baselines (מספר baselines) | ✔ (11) | ✔ | ✗ | ✔ (1) | ✔ | ✔ |
| משאבים: יחידות, עלות, overallocation | ✔ | חלקי | חלקי (Workload) | חלקי | חלקי | ✔ |
| יישור משאבים (Leveling) | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ |
| Earned Value (EVM) | ✔ | ✗ | ✗ | ✗ | ✗ | ✔ |
| ייבוא/ייצוא .mpp / MSPDI XML | ✔ | דרך Power App | ייבוא בלבד | ייבוא/ייצוא | ייבוא | ✔ |
| שיתופיות בזמן אמת | ✗ | ✔ | ✔ | ✔ | ✔ | ✗ |
| Kanban / Agile | חלקי | ✔ | ✔ | ✔ | ✔ | ✗ |
| RTL / עברית מלאה בגאנט | ✗ | חלקי | חלקי (UI כן, גאנט לא) | ✗ | ✗ | ✗ |
| תרגום תוכן משימות לכל משתמש | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| AI (בניית תכנית, סיכום, סיכונים) | Copilot | סוכן בפריוויו | ✔ | ✔ | ✗ | ✗ |

**מסקנה מהמטריצה:** אף מוצר לא משלב מנוע תזמון מלא + שיתופיות מודרנית + עבודה דו-לשונית אמיתית (RTL ותרגום תוכן). זה הריבוע הריק.

---

## 3. מה משתמשים אוהבים, ומה כואב להם

**מה מעריכים ב-MS Project** (ולכן חייבים להיות אצלנו):
- מנוע תזמון דטרמיניסטי: משנים משך של משימה אחת, כל הפרויקט מתעדכן נכון.
- תצוגת Gantt + טבלה צמודה (split view) עם עמודות ניתנות להתאמה.
- Baselines והשוואת תכנון מול ביצוע.
- דוחות משאבים ו-Resource Usage.

**מה כואב** (ולכן נפתור):
1. **עקומת למידה.** נבנה "מצב פשוט" ברירת מחדל (תזמון אוטומטי, FS בלבד גלוי) ו"מצב מתקדם" שנפתח לפי צורך.
2. **אין שיתופיות.** עריכה משותפת בזמן אמת, הרשאות לפי פרויקט, היסטוריית שינויים, תגובות על משימות.
3. **Windows בלבד.** אפליקציית web מלאה, PWA למובייל.
4. **מחיר.** תמחור שקוף; צופים (viewers) חינם; תשלום רק על עורכים.
5. **לא Agile.** תצוגת Kanban וספרינטים מעל אותו מודל נתונים.
6. **קבצים במייל.** ייבוא .mpp/XML וייצוא חזרה, כדי לעבוד מול לקוחות שעדיין ב-MS Project (פירוט פורמטים בסעיף 8.4).
7. **שפה.** פרויקטים משותפים עם שותפים בחו"ל מנוהלים באנגלית, והצוות המקומי משלם על זה בנוחות. אף כלי לא מתרגם תוכן משימות לכל משתמש.

---

## 4. הגדרת המוצר שנבנה

### 4.1 קהל יעד
- **ראשוני:** מנהלי פרויקטים ו-PMO בארגונים בינוניים (בנייה, תשתיות, הנדסה, הייטק, ממשל) בישראל, שעובדים היום ב-MS Project או באקסל ורוצים כלי web שיתופי בעברית.
- **משני:** צוותי מוצר ופיתוח שצריכים גאנט אמיתי לצד Kanban.
- **לא קהל יעד ב-v1:** פורטפוליו ארגוני בקנה מידה של Primavera (אלפי פרויקטים, EPS).

### 4.2 עקרונות מנחים
1. **המנוע קודם.** כל תצוגה (גאנט, טבלה, Kanban, לוח שנה) היא השלכה של אותו מודל נתונים ואותו מנוע תזמון.
2. **דו-לשוני באמת.** כל משתמש בוחר שפת ממשק ושפת תצוגה לתוכן. טקסט מעורב (עברית ומספרים ואנגלית) מוצג נכון (bidi) בכל מקום, כולל בתוך סרגלי הגאנט. היפוך ציר הזמן ל-RTL הוא העדפה אישית. שפת העבודה של פרויקט משותף היא לרוב אנגלית, והתרגום לכל משתמש הופך את זה לשקוף.
3. **מורכבות הדרגתית.** ברירת מחדל פשוטה, יכולות MS Project מלאות למי שמחפש אותן.
4. **פתוח כלפי חוץ.** ייבוא/ייצוא MSPDI XML ו-.mpp, API ציבורי, webhooks.
5. **AI כעוזר, לא כקסם.** ה-AI מציע, המנוע מחשב, האדם מאשר.

---

## 5. פיצ'רים לפי שלבים

### 5.1 MVP (שלב 1, כ-3 חודשים)

**ליבה: משימות ותזמון**
- WBS היררכי ללא הגבלת עומק, summary tasks מחושבות, אבני דרך.
- שדות: שם, התחלה, סיום, משך (ימי עבודה/שעות), % השלמה, אחראי, עדיפות, סטטוס, תגיות, הערות.
- 4 סוגי תלויות (FS, SS, FF, SF) עם lag/lead (ימים, שעות, אחוז ממשך הקודם).
- תזמון אוטומטי קדימה (forward pass) מתאריך תחילת פרויקט + backward pass לחישוב float ונתיב קריטי.
- לוח שנה לפרויקט (ימי עבודה, שעות עבודה, חגים; ברירת מחדל: א'–ה' + חגי ישראל) **ולוח שנה לכל משאב/אחראי**. בפרויקט משותף עם חו"ל הצוות הישראלי עובד א'–ה' והשותף ב'–ו', ובלי לוחות שנה נפרדים הגאנט המשותף פשוט שגוי. לכן זה ב-MVP ולא ב-1.0.
- אילוצים בסיסיים: ASAP, Start No Earlier Than, Must Start On.
- משימות בתזמון ידני (Manually Scheduled) לצד אוטומטי, כמו ב-MS Project.

**תצוגות**
- גאנט + טבלה צמודה: גרירת סרגלים, שינוי משך, יצירת תלות בגרירה, zoom (שעות עד שנים), הדגשת נתיב קריטי, קו "היום".
- טבלה בלבד (spreadsheet-like) עם עריכה inline, עמודות מותאמות, מיון/סינון/קיבוץ.
- Kanban לפי סטטוס.
- Undo/Redo מלא.

**שיתופיות**
- פרויקטים, חברי צוות, הרשאות (בעלים/עורך/צופה).
- עריכה משותפת בזמן אמת (נוכחות, סמנים, עדכון מיידי).
- תגובות על משימה, @אזכורים, התראות בסיסיות.

**ייבוא/ייצוא** (פירוט בסעיף 8.4)
- ייבוא MSPDI XML (פורמט ה-XML של MS Project) + CSV/Excel.
- ייצוא MSPDI XML (נפתח ישירות ב-MS Project), Excel, PDF/PNG של הגאנט.
- פורמט JSON פנימי מלא לגיבוי ולהעתקת פרויקטים.

**בינלאומיות**
- ממשק בעברית ובאנגלית מהיום הראשון, לפי בחירת המשתמש. bidi נכון בטבלה ובסרגלים. תאריכים, שעות ואזור זמן לפי המשתמש.
- היפוך ציר הזמן ל-RTL כהעדפת משתמש (ברירת מחדל LTR גם בממשק עברי, כדי להישאר תואמים לגאנטים של השותפים).

### 5.2 גרסה 1.0 (שלב 2, כ-3 חודשים נוספים)
- **Baselines:** שמירת עד 11 baselines, השוואה ויזואלית בגאנט (סרגל אפור מתחת), עמודות סטייה (Start Variance, Finish Variance, Work Variance).
- **משאבים:** משאבי עבודה/חומר/עלות, יחידות (units), תעריף, לוח שנה לכל משאב, הקצאות מרובות למשימה, חישוב Work = Duration × Units, סוגי משימה (Fixed Units / Fixed Duration / Fixed Work).
- **תצוגות משאבים:** Resource Sheet, Resource Usage, היסטוגרמת עומס, הדגשת overallocation.
- **עלויות:** עלות מתוכננת/בפועל/נותרת ברמת משימה ופרויקט.
- **כל האילוצים:** ALAP, SNET, SNLT, FNET, FNLT, MSO, MFO + Deadline.
- **ייבוא .mpp בינארי** (דרך MPXJ כשירות צד-שרת) וייבוא Primavera P6 (XER / PMXML).
- **תרגום תוכן לכל משתמש** (סעיף 8.3): שמות משימות, תיאורים, הערות ותגובות מוצגים לכל משתמש בשפתו, עם מילון מונחים לפרויקט והצגת המקור בריחוף.
- **מעקב:** Actual Start/Finish, Actual Work, Remaining Work, Status Date, Reschedule uncompleted work.
- **דוחות:** דשבורד פרויקט, משימות באיחור, אבני דרך, S-curve.
- **לוח שנה ותצוגת Timeline** (סיכום לרמת ההנהלה).

### 5.3 גרסה 2.0 (שלב 3)
- **יישור משאבים (Resource Leveling)** אוטומטי עם אפשרות ליישר לפי slack בלבד, ו-leveling ידני.
- **Earned Value Management:** PV, EV, AC, SPI, CPI, EAC, ETC.
- **פורטפוליו:** תצוגה חוצת פרויקטים, תלויות בין פרויקטים, מאגר משאבים משותף.
- **Sprints/Agile מעל ה-WBS:** Backlog, ספרינטים, burndown, מיפוי story points ↔ work.
- **AI:**
  - יצירת WBS ראשוני מתיאור טקסטואלי או ממסמך אפיון.
  - הצעת תלויות ומשכים על בסיס פרויקטים קודמים.
  - זיהוי סיכוני לו"ז (משימות קריטיות עם אחראי בעומס יתר, צפיפות אבני דרך).
  - שאלות בשפה טבעית על הפרויקט ("מה יזוז אם ההיתר יתעכב שבועיים?") שמריצות סימולציה במנוע.
  - סיכום סטטוס שבועי אוטומטי.
- **אוטומציות ואינטגרציות:** webhooks, Slack/Teams, Jira sync, Google/Outlook Calendar, Excel live link.
- **תרגום מורחב:** קבצים מצורפים, סיכומי פגישות, ייצוא דו-לשוני (עברית ואנגלית באותו PDF).
- **ייצוא .mpp בינארי** דרך ספרייה מסחרית (Aspose.Tasks) אם לקוחות ידרשו, וייצוא Primavera PMXML.
- **אפליקציה למובייל** (PWA, ואחר כך native אם יש ביקוש).

---

## 6. מודל הנתונים (ליבה)

```
Organization ─┬─ User (role)
              ├─ Calendar (base calendars: Standard IL, 24h, Night shift…)
              │     └─ CalendarException (holiday / special working day)
              ├─ Resource (type: work|material|cost, maxUnits, rate, calendarId)
              └─ Project
                    ├─ projectStart, statusDate, calendarId, schedulingMode
                    ├─ Task (tree via parentId + order)
                    │     ├─ name (LocalizedText), wbs, duration, start, finish, percentComplete
                    │     ├─ schedulingMode: auto | manual
                    │     ├─ constraintType, constraintDate, deadline
                    │     ├─ taskType: fixedUnits | fixedDuration | fixedWork
                    │     ├─ effortDriven, isMilestone, isSummary (derived)
                    │     ├─ calendarId (optional override)
                    │     ├─ actualStart, actualFinish, actualWork, remainingWork
                    │     ├─ computed: earlyStart, earlyFinish, lateStart, lateFinish,
                    │     │            totalSlack, freeSlack, isCritical
                    │     └─ customFields (JSON, typed per project)
                    ├─ Dependency (predecessorId, successorId, type FS|SS|FF|SF, lag, lagUnit)
                    ├─ Assignment (taskId, resourceId, units, work, cost, actualWork)
                    ├─ Baseline (index 0–10, takenAt) ─ BaselineTask (start, finish, duration, work, cost)
                    ├─ Comment, Attachment, ActivityLog (event-sourced changes)
                    └─ View (saved column sets, filters, groupings, zoom)
```

**הערות עיצוב:**
- `LocalizedText` הוא אובייקט `{ he: {text, source: human|machine, hash}, en: {...} }`, כך שכל שדה טקסט חופשי (שם משימה, תיאור, הערה, תגובה, שם סטטוס) נשמר בכל שפה פעילה בפרויקט עם סימון מי כתב אותו (סעיף 8.3).
- שדות מחושבים (early/late/slack/critical) נשמרים בכתיבה כדי שמיון וסינון בטבלה יהיו מהירים, ומחושבים מחדש בכל שינוי רלוונטי.
- כל שינוי נשמר כאירוע (event sourcing) כדי לאפשר היסטוריה, undo משותף, ו-"מי שינה מה".
- משך נשמר תמיד בדקות עבודה (כמו MS Project), והצגה בימים/שעות היא שכבת תצוגה תלוית לוח שנה.

---

## 7. מנוע התזמון (הנכס המרכזי)

ספריית TypeScript טהורה, ללא תלות ב-DOM או ב-DB, שרצה גם בדפדפן (תגובה מיידית) וגם בשרת (מקור האמת). אותו קוד בשני המקומות מונע סטיות.

**אלגוריתם:**
1. בניית גרף תלויות + גילוי מעגלים (דחיית תלות שיוצרת מעגל).
2. מיון טופולוגי (Kahn).
3. **Forward pass:** לכל משימה early start/finish לפי קודמות, סוג תלות, lag מתורגם לזמן עבודה בלוח השנה של המשימה (או של הפרויקט), ואילוצים. Summary tasks מקבלות min/max של הילדים.
4. **Backward pass** מסיום הפרויקט (או מ-deadline/אילוץ מאוחר): late start/finish.
5. Total slack = late start − early start בזמן עבודה; free slack מול הממשיך הקרוב; critical = slack ≤ 0 (סף ניתן להגדרה כמו ב-MS Project).
6. **הקצאות:** Work = Duration × Units לפי taskType; בשינוי אחד משלושת הערכים, השלישי מחושב לפי הסוג הקבוע.
7. **Status date / tracking:** פיצול משימה שהחלה ולא הסתיימה כך שהעבודה הנותרת מתוזמנת אחרי status date (אופציונלי, כמו Reschedule Work).
8. **Leveling (v2):** איטרטיבי, מזיז רק משימות auto ללא אילוצי Must, מוגבל ל-slack או לא, לפי עדיפות ו-ID.

**ביצועים:** יעד 10,000 משימות ב-<100ms לחישוב מלא בדפדפן; חישוב אינקרמנטלי (רק תת-הגרף שהושפע) לעריכה אינטראקטיבית.

**בדיקות:** חבילת golden tests שמשווה את תוצאות המנוע לקבצי MSPDI שנוצרו ב-MS Project עבור עשרות תרחישים (כל סוגי התלויות, lag שלילי, לוחות שנה שונים, אילוצים). זה גם מאפשר להבטיח ייבוא/ייצוא נאמן.

---

## 8. ארכיטקטורה טכנית

| שכבה | בחירה מוצעת | נימוק |
|---|---|---|
| Frontend | React + TypeScript, Vite | אקוסיסטם ספריות הגאנט הגדול ביותר; צוות זמין |
| State | Zustand/Jotai + CRDT (Yjs) לעריכה משותפת | Yjs נותן real-time ו-offline בלי לכתוב merge ידני |
| רכיב גאנט | **SVAR React Gantt (MIT)** כבסיס; רינדור Canvas/SVG משלנו בהמשך | MIT, וירטואליזציה ל-10K משימות, תלויות וגרירה. חסר RTL ו-baselines בחינם, ולכן תוכנית מעבר (ראו 8.1) |
| טבלה | TanStack Table + וירטואליזציה | עריכה inline, עמודות דינמיות |
| Backend | Node.js (NestJS או Fastify) + TypeScript | אותו מנוע תזמון בשרת ובלקוח |
| DB | PostgreSQL (JSONB לשדות מותאמים), Redis ל-presence/pub-sub | טרנזקציות, ltree להיררכיה |
| Real-time | WebSocket (y-websocket / Hocuspocus) | סנכרון CRDT |
| ייבוא .mpp | שירות Java קטן עם MPXJ (LGPL) | הספרייה היחידה הבוגרת לקריאת .mpp בינארי; MSPDI XML נכתוב ישירות ב-TS |
| AI | Claude API (claude-fable-5-1 למשימות מורכבות, claude-haiku-5-5 לסיכומים) עם tool use מול מנוע התזמון | ה-AI קורא למנוע ולא "מנחש" תאריכים |
| Auth | OIDC (Google, Microsoft Entra), SSO ארגוני | רוב קהל היעד ב-M365 |
| פריסה | Docker, Kubernetes או Fly.io; אופציית self-host לארגונים רגישים | קהל ממשלתי/ביטחוני דורש on-prem |

### 8.1 Build vs Buy ברכיב הגאנט

| אפשרות | יתרונות | חסרונות | מחיר |
|---|---|---|---|
| **Bryntum Gantt** | הכי שלם: מנוע תזמון מובנה, baselines, leveling, ייבוא MSP | מנוע סגור, רישיון למפתח, learning curve, RTL חלקי | כ-900$ למפתח (perpetual) |
| **DHTMLX Gantt** | בוגר, ביצועים טובים, מודול ייצוא MSP | **אין RTL** ולא בתכנון; GPL/מסחרי | כ-700–800$ למפתח ועד 6,000$ ללא הגבלה |
| **Syncfusion / Telerik (Kendo)** | **תמיכת RTL מובנית**, נתיב קריטי, baselines | רישיון מסחרי לכל הסוויטה, פחות גמיש לעיצוב משלנו | מאות עד אלפי $ למפתח לשנה |
| **SVAR React Gantt (MIT)** | חינם, מודרני, 10K משימות, גרירה ותלויות | RTL, baselines, לוח שנה ו-auto-scheduling רק ב-PRO; נצטרך להרחיב | חינם / PRO בתשלום |
| **frappe-gantt (MIT)** | פשוט מאוד | לא מתאים למוצר מלא | חינם |
| **רינדור משלנו (Canvas/SVG)** | שליטה מלאה: RTL אמיתי, ביצועים, מיתוג | זמן פיתוח של 2–3 חודשי מפתח | פנימי |

**המלצה:** להתחיל עם SVAR ל-MVP כדי להגיע מהר לדמו, כשמנוע התזמון שלנו מחליף את המנוע הפנימי של הרכיב מהיום הראשון. מאחר שהיפוך ציר הזמן הוא העדפה ולא דרישת MVP (סעיף 8.2), הלחץ לכתוב רינדור משלנו מוקדם קטן בהרבה. מה שכן חייב לעבוד ב-SVAR כבר ב-MVP הוא bidi נכון של טקסט בתוך הסרגלים ובטבלה, וזה ניתן לפתרון ב-CSS ובסימוני כיווניות. רינדור משלנו של ציר הזמן נשקל מחדש לקראת 1.0 לפי משוב הפיילוט. אם לוח הזמנים חשוב יותר מהעלות, Syncfusion היא הדרך הקצרה ל-RTL מלא מוכן.

### 8.2 RTL ועברית: מה חייב ומה העדפה

**ההנחה המעודכנת:** רוב הפרויקטים של קהל היעד משותפים עם חברות בחו"ל ומנוהלים באנגלית. לכן הדרישה הקשיחה היא לא "גאנט הפוך" אלא שכל משתמש יוכל לעבוד בשפה שלו מעל אותו פרויקט.

**חייב (MVP):**
- ממשק משתמש מלא בעברית ובאנגלית, לפי בחירת המשתמש, כולל כותרות עמודות, תפריטים, הודעות שגיאה ותבניות תאריך.
- bidi נכון לטקסט מעורב (עברית + מספרים + מונחים באנגלית) בטבלה, בסרגלי הגאנט, בתוויות ובייצוא PDF עם פונטים עבריים.
- לוח שנה ישראלי מוכן: שבוע עבודה א'–ה', חגים יהודיים לפי לוח עברי (מחושב, לא ידני), ימי זיכרון, אופציה לשבוע 6 ימים. לצד לוחות שנה של ארה"ב ואירופה למשאבים של השותפים.

**העדפת משתמש (MVP כאפשרות, לא ברירת מחדל):**
- היפוך ציר הזמן: תאריכים מוקדמים בימין, הטבלה בצד ימין והגאנט בשמאל, חיצי תלויות וקו "היום" משתקפים. ברירת המחדל נשארת LTR גם בממשק עברי, כי כך הגאנט שלנו נראה כמו הגאנט שהשותף בחו"ל רואה ומייצא.

### 8.3 תרגום תוכן לכל משתמש ("תרגום סימולטני")

**ההפרדה הבסיסית:** שפת הממשק (תפריטים, עמודות, תאריכים) היא i18n רגיל. שפת התוכן (שמות משימות, תיאורים, הערות, תגובות, שדות טקסט מותאמים, שמות סטטוסים ותגיות) היא הפיצ'ר המבדל. Slack ו-Teams מתרגמים הודעות, אבל monday, Asana, Smartsheet ו-Planner לא מתרגמים תוכן משימות.

**המודל: שדה רב-לשוני עם סימון מי כתב מה**
- כל שדה טקסט חופשי נשמר כ-`LocalizedText`: גרסה לכל שפה פעילה בפרויקט, ולכל גרסה דגל "נכתב בידי אדם" או "תרגום מכונה".
- דוגמה: מנהל ישראלי מקליד "קבלת היתר בנייה". העברית נשמרת כמקור, המערכת מייצרת מיד "Receive building permit" כתרגום מכונה, והשותף בארה"ב רואה אנגלית. אם השותף מתקן את האנגלית, הגרסה שלו הופכת ל"נכתב בידי אדם" והעברית מתורגמת מחדש ומסומנת כמכונה.
- יתרונות על פני "שפת אמת אחת לפרויקט": אין סחף של תרגום הלוך ושוב כי המקור של כל כותב נשמר; כל משתמש עורך בשפתו בלי שלב אישור; המקור תמיד זמין בריחוף עם סימון עדין "תורגם מעברית".

**מה מתרגמים ומה לא**
- כן: שמות משימות, תיאורים, הערות, תגובות, שמות סטטוסים ותגיות, שמות קבצים מצורפים.
- לא: שמות אנשים, קודי WBS, מק"טים, שמות לקוחות ומוצרים, טקסט חוזי שמסומן כמחייב. אלה נכנסים למילון הפרויקט כ"לא לתרגם".
- **מילון מונחים לפרויקט** הוא הלב של האיכות. שמות משימות קצרים ודו-משמעיים ("סגירה" יכולה להיות Close או Closing), ולכן התרגום מקבל הקשר: שרשרת משימות האב, המילון ותחום הפרויקט. זו הסיבה להעדיף מודל שפה (Haiku לעלות ולמהירות, Fable למקרים קשים) על מנועי תרגום קלאסיים (DeepL, Google Translate, Azure Translator) שאינם מקבלים מילון והקשר באותה גמישות. אפשר לשלב: מנוע קלאסי כ-fallback זול.

**מכניקה**
- תרגום בזמן כתיבה, לא בזמן קריאה: בשמירה מתורגם לכל השפות הפעילות בפרויקט ונשמר במטמון לפי hash של התוכן ושל גרסת המילון. הקורא לא מחכה.
- בעריכה משותפת בזמן אמת, הצד השני רואה את הטקסט החדש אחרי השהיה של שנייה או שתיים עם סימון "מתרגם".
- תיקון תרגום בקליק אחד הופך אותו ל"נכתב בידי אדם" ומעדכן את המילון אם המשתמש מבקש.
- חיפוש וסינון עובדים על כל השפות במקביל.
- ייצוא (PDF, Excel, MSPDI XML) בשפה שבוחרים: אנגלית לשותף, עברית לדירקטוריון. ב-2.0 ייצוא דו-לשוני.
- **פרטיות:** לקוחות ממשלתיים וביטחוניים לא יסכימו ששמות משימות ייצאו ל-API חיצוני. מהיום הראשון: כיבוי תרגום ברמת פרויקט/ארגון, ובפריסת self-host אפשרות למודל תרגום מקומי.

**מיקום בתכנית:** MVP מקבל i18n של הממשק ובחירת שפה למשתמש. גרסה 1.0 מקבלת תרגום תוכן עם מילון והצגת מקור. גרסה 2.0 מרחיבה לקבצים מצורפים, סיכומי פגישות וייצוא דו-לשוני.

### 8.4 ייבוא וייצוא: פורמטים

אין תקן רשמי (ISO) לקובץ לוח זמנים. התקן בפועל הוא של MS Project, ובענפי הבנייה והתשתיות גם של Primavera P6.

| פורמט | מה זה | קריאה | כתיבה | הערות |
|---|---|---|---|---|
| **MSPDI XML** (Project XML, `.xml`) | סכמת ה-XML הפתוחה והמתועדת של MS Project | ✔ MVP | ✔ MVP | **הפורמט הראשי שלנו.** MS Project פותח אותו ישירות, וכך גם Primavera, Smartsheet, monday, Asana, OpenProject, ProjectLibre. מכסה משימות, תלויות, לוחות שנה, משאבים, הקצאות, baselines, שדות מותאמים. נכתב ישירות ב-TypeScript, בלי ספרייה חיצונית |
| **.mpp** | הפורמט הבינארי הסגור של MS Project | ✔ 1.0 דרך MPXJ | ✗ (2.0 אופציונלי) | אף ספריית קוד פתוח לא כותבת .mpp. MPXJ (Java, LGPL) קוראת .mpp מגרסאות 98 עד 2024. כתיבה אפשרית רק עם ספריות מסחריות כמו Aspose.Tasks. בפועל לא צריך: משתמש MS Project פותח את ה-XML שלנו ושומר כ-.mpp בעצמו |
| **.mpx** | פורמט טקסט ישן של MS Project (עד 98) | ✔ 1.0 (MPXJ) | ✗ | כלים ישנים עדיין מייצאים אותו |
| **Primavera P6: XER ו-PMXML** | הפורמטים של Oracle Primavera | ✔ 1.0 (MPXJ) | PMXML ב-2.0 | הכרחי ללקוחות בנייה ותשתיות שהקבלנים שלהם עובדים ב-P6 |
| **Excel / CSV** | רשימת משימות שטוחה או היררכית | ✔ MVP | ✔ MVP | אשף מיפוי עמודות; קודי WBS או הזחה להיררכיה; תלויות כטקסט "3FS+2d" כמו ב-Project |
| **JSON פנימי** | הייצוג המלא שלנו, כולל תרגומים, תגובות, היסטוריה | ✔ MVP | ✔ MVP | גיבוי, שכפול פרויקטים, API |
| **PDF / PNG / SVG** | תמונת הגאנט | ✗ | ✔ MVP | ייצוא לפי טווח תאריכים, רמת zoom, עמודות נבחרות, שפה; פונטים עבריים ו-RTL נכון |
| **iCalendar (.ics)** | אבני דרך ומשימות כאירועי יומן | ✗ | ✔ 1.0 | סנכרון ל-Outlook/Google Calendar |
| GanttProject `.gan`, ProjectLibre `.pod`, Asta `.pp` | פורמטים של כלים אחרים | ✔ 1.0 (MPXJ) | ✗ | MPXJ קוראת את כולם; עלות שולית |

**עקרונות:**
- **נאמנות הלוך-חזור.** בדיקות אוטומטיות: ייבוא MSPDI → ייצוא → השוואה. כל שינוי בתאריכים או ב-slack הוא באג. זה אותו סט golden tests של מנוע התזמון (סעיף 7).
- **מיפוי שדות מותאמים.** שדות הטקסט/מספר/תאריך שלנו ממופים ל-Text1–30, Number1–20, Date1–10 של MS Project, עם שמירת שמות השדות ב-ExtendedAttributes.
- **שפה בייצוא.** המשתמש בוחר שפת ייצוא; `LocalizedText` מתמוטט לשפה אחת. בייבוא, שפת המקור מזוהה אוטומטית ומסומנת כ"נכתב בידי אדם".
- **מה הולך לאיבוד.** תגובות, היסטוריה ותרגומים לא קיימים ב-MSPDI ולא מיוצאים אליו; ייצוא JSON שומר הכול. מסמכים ב-UI כ"מה כלול בייצוא".
- **MPXJ כשירות נפרד.** בגלל רישיון LGPL והיותו Java, רץ כ-microservice קטן שמקבל קובץ ומחזיר MSPDI XML, שהמערכת כבר יודעת לקרוא. כך הנתיב של כל פורמט זר הוא: MPXJ → MSPDI → המודל שלנו.

---

## 9. בידול: למה שמישהו יעבור אלינו

1. **MS Project בדפדפן, בשיתוף, בשפה של כל משתמש.** מנוע תזמון אמיתי שאין ב-monday/Asana, בחוויית web שאין ב-Project Desktop, ותרגום תוכן לכל משתמש שאין באף כלי ניהול פרויקטים. הצוות בישראל עובד בעברית והשותף בחו"ל באנגלית, על אותו גאנט.
2. **תאימות ל-MS Project.** ייבוא/ייצוא נאמן, אז המעבר לא כואב והעבודה מול קבלנים/לקוחות שעדיין ב-Project נמשכת.
3. **מחיר הוגן.** צופים חינם; עורכים בתשלום. יעד: 12–15$ לעורך לחודש, מתחת ל-Plan 3 של מיקרוסופט ועם יכולות Plan 5 בחלקן.
4. **AI שמבין תזמון.** לא רק סיכומים: סימולציות what-if, זיהוי סיכונים, בניית WBS. היתרון שלנו הוא שה-AI מחובר למנוע דטרמיניסטי.
5. **Self-host.** לארגונים שלא יכולים לעלות לענן ציבורי.

---

## 10. סיכונים ודרכי התמודדות

| סיכון | השפעה | התמודדות |
|---|---|---|
| מנוע התזמון לא תואם בדיוק ל-MS Project | אובדן אמון של PMs מנוסים | golden tests מול קבצי MSPDI אמיתיים; תיעוד ההבדלים המכוונים |
| RTL בגאנט דורש רינדור משלנו מוקדם מהצפוי | עיכוב MVP | לתכנן את שכבת הרינדור כמודול מוחלף מהיום הראשון |
| מיקרוסופט מחזקת את Planner Premium ו-Copilot | תחרות ישירה בקהל M365 | להתמקד ב-RTL, במחיר, ב-self-host ובתאימות |
| ביצועים בפרויקטים גדולים (10K+ משימות) | חוויית משתמש גרועה | וירטואליזציה, חישוב אינקרמנטלי, Web Worker למנוע |
| שיתופיות + תזמון אוטומטי (שני אנשים משנים בו זמנית) | קונפליקטים לא אינטואיטיביים | CRDT לשדות קלט; השדות המחושבים נגזרים דטרמיניסטית ולא מסונכרנים |
| רישיון LGPL של MPXJ | מגבלות משפטיות | הפעלה כשירות נפרד (microservice), בלי לינקינג סטטי |
| תרגום מכונה שגוי בשם משימה מחייב (חוזה, אבן דרך לתשלום) | אי-הבנה בין שותפים | סימון ברור "תרגום מכונה", מקור בריחוף, מילון פרויקט, אפשרות לסמן שדה כ"מחייב במקור בלבד" |
| תוכן פרויקט נשלח ל-API תרגום חיצוני | חסם רגולטורי ללקוחות ממשל/ביטחון | כיבוי תרגום לפרויקט/ארגון; מודל מקומי ב-self-host |

---

## 11. תכנית עבודה מוצעת

| שלב | משך | תוצר |
|---|---|---|
| 0. אפיון מעמיק | 2–3 שבועות | ראיונות עם 8–10 מנהלי פרויקטים, הגדרת 5 תרחישי ליבה, אב-טיפוס Figma ב-RTL |
| 1. מנוע תזמון | 4–6 שבועות | ספריית TS עם CPM, לוחות שנה, 4 תלויות, אילוצים; 100+ golden tests מול MSPDI |
| 2. MVP | 8–10 שבועות | גאנט+טבלה, Kanban, real-time, לוחות שנה למשאבים, ייבוא/ייצוא MSPDI XML ו-Excel, ממשק עברית/אנגלית |
| 3. פיילוט | 4 שבועות | 3–5 ארגונים, מדידת זמן למשימה ראשונה, שיעור ייבוא מוצלח |
| 4. גרסה 1.0 | 10–12 שבועות | baselines, משאבים, עלויות, ייבוא .mpp ו-P6, תרגום תוכן לכל משתמש, מעקב, דוחות |
| 5. גרסה 2.0 | רבעון | leveling, EVM, פורטפוליו, AI, אינטגרציות |

**צעדים מיידיים:**
1. לאשר את הגדרת קהל היעד והיקף ה-MVP (סעיפים 4–5).
2. להחליט Build vs Buy ברכיב הגאנט (סעיף 8.1).
3. להקים את ריפו המנוע ולהתחיל ב-golden tests: לייצר 20 קבצי MSPDI מ-MS Project שמכסים את כל סוגי התלויות והאילוצים.
4. אב-טיפוס Figma של גאנט משותף: משתמש עברי ומשתמש אנגלי על אותו פרויקט, לאימות מודל התרגום וה-bidi מול משתמשים.
5. להשיג 3–5 קבצי .mpp ו-XER אמיתיים מלקוחות פוטנציאליים לבדיקת ייבוא.

---

## 12. מקורות

**מיקרוסופט: Project, Planner, מחירים**
- [Microsoft Project for the Web Becoming Planner](https://www.theprojectgroup.com/blog/en/project-for-the-web-becoming-planner/)
- [Microsoft Project Online Retirement: What To Do Before September 30, 2026](https://www.velosio.com/blog/microsoft-project-online-retirement-what-to-do-before-september-30-2026/)
- [There is a Plan for Project (Directions on Microsoft)](https://www.directionsonmicrosoft.com/reports/there-is-a-plan-for-project/)
- [Planner vs Project (Virto Software)](https://www.virtosoftware.com/pm/microsoft-planner-vs-project/)
- [Microsoft Project Pricing 2026 (Lark)](https://www.larksuite.com/en_us/blog/microsoft-project-pricing)
- [Microsoft Project pricing plans (SaaSworthy)](https://www.saasworthy.com/blog/microsoft-project-pricing-plans)

**כאבי משתמשים ואלטרנטיבות**
- [What frustrates the Microsoft Project user community (MPUG)](https://www.mpug.com/what-frustrates-the-microsoft-project-user-community)
- [20 Best Microsoft Project Alternatives for 2026 (ProjectManager)](https://www.projectmanager.com/microsoft-project-alternative)
- [Microsoft Project alternatives (Celoxis)](https://es.celoxis.com/article/microsoft-project-alternatives)

**השוואת כלי גאנט ו-SaaS**
- [Best Gantt Chart Software in 2026 (TeamGantt)](https://www.teamgantt.com/gantt-chart-software)
- [Gantt chart comparison (Software Advice)](https://www.softwareadvice.com/project-management/gantt-chart-comparison/)
- [Best Gantt chart software of 2026 (TechRadar)](https://www.techradar.com/best/gantt-chart-software)
- [Instagantt vs TeamGantt](https://www.instagantt.com/compare/teamgantt)
- [Monday.com vs Asana 2026 (Costbench)](https://costbench.com/compare/monday-vs-asana/)
- [Asana vs Monday (Capterra)](https://www.capterra.com/compare/147657-184581/monday-com-vs-Asana-PM)
- [7 AI Project Management Tools in 2026 (TechRepublic)](https://www.techrepublic.com/article/ai-project-management-tools/)

**קוד פתוח**
- [8 Best Open Source Project Management Software of 2026 (TechRepublic)](https://www.techrepublic.com/article/open-source-project-management-software/)
- [OpenProject vs ProjectLibre (OpenProject)](https://www.openproject.org/es/alternativas-de-software-de-gestion-de-proyectos/mejor-alternativa-ms-projectlibre/)
- [GanttProject alternatives (AlternativeTo)](https://alternativeto.net/software/ganttproject)
- [OpenProject vs Microsoft Project (Capterra)](https://www.capterra.com/compare/152761-198049/OpenProject-vs-Microsoft-Project)

**ספריות גאנט ל-JavaScript**
- [SVAR React Gantt docs](https://docs.svar.dev/react/gantt/overview)
- [SVAR React Gantt v2.4: PRO Edition, MCP Server & MIT License](https://svar.dev/blog/react-gantt-pro-2-4-released/)
- [SVAR React Gantt pricing](https://svar.dev/react/gantt/pricing)
- [Top 5 JavaScript Gantt chart libraries in 2025 (Bryntum)](https://bryntum.com/?p=26805)
- [Top 5 JavaScript Gantt Chart Libraries (Syncfusion)](https://www.syncfusion.com/blogs/post/top-5-javascript-gantt-chart-libraries)
- [I Compared 5 Free JavaScript Gantt Libraries by Project Fit (HackerNoon)](https://hackernoon.com/i-compared-5-free-javascript-gantt-libraries-by-project-fit)
- [DHTMLX licenses](https://dhtmlx.com/docs/products/licenses)
- [Bryntum vs DHTMLX (TrustRadius)](https://www.trustradius.com/compare-products/bryntum-vs-dhtmlx)

**RTL**
- [Syncfusion Gantt globalization and RTL](https://help.syncfusion.com/gantt-sdk/javascript/gantt-chart/global-local)
- [Telerik Gantt globalization and RTL](https://www.telerik.com/design-system/docs/components/gantt/globalization/)
- [DHTMLX forum: RTL support](https://forum.dhtmlx.com/t/right-to-left-support-rtl-support/20370)
- [Redmine issue #43678: Gantt RTL](https://www.redmine.org/issues/43678?tab=history)

**מנוע תזמון וייבוא MS Project**
- [How the planning engine works (oculai)](https://support.oculai.de/en/articles/626069-how-the-planning-engine-works)
- [Scheduler engine README (RV Grid)](https://rv-grid.com/pro-pages/packages/enterprise/plugins/gantt/engine/scheduler-engine/README)
- [Task Dependencies: FS, SS, FF, and SF](https://resources.rework.com/vi/libraries/project-management/task-dependencies)
- [MPXJ on SourceForge](https://sourceforge.net/p/mpxj)
- [MPXJ.Net on NuGet](https://www.nuget.org/packages/MPXJ.Net)
- [DHTMLX MS Project export module](https://docs.dhtmlx.com/gantt/guides/msp-export-module-whatsnew/)
- [MPXJ: supported file formats](https://www.mpxj.org/supported-formats/)
- [Microsoft Project XML Data Interchange (MSPDI) schema reference](https://learn.microsoft.com/en-us/office-project/xml-data-interchange/project-xml-data-interchange-schema-reference)
- [Aspose.Tasks (commercial .mpp writer)](https://products.aspose.com/tasks/)
