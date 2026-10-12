# OSUIT ETDE Assessment & Accreditation Hub: User Guide (v5.2)

A website for collecting ABET evidence in the Instrumentation & Automation program. Sign in with your faculty account, upload Canvas grades, and the Hub works out the student outcome (SO) results for the self-study.

## For instructors: three steps

1. **Sign in.** The Hub opens to **My Courses**. The first time, choose your name in "I am"; the Hub remembers it on that computer.
2. **Click "Upload Canvas grades"** on the course card. Export the gradebook from Canvas (Grades → Export → CSV) and choose that file. The Hub already knows the course and which ABET assignment to look for, so confirm the match and click **Save Upload**.
3. **Done.** The course gets a ✅ once everything due this term is in. If a course says "Nothing to do", no ABET evidence is scheduled for it this term.

Capstone (ETDE 4813) and Internship (ETDE 4112) cards also show buttons for journals and employer evaluations.

## For the ABET coordinator

Use **🎯 Outcomes & Improvement** in the menu:

| Tab | What it is for |
|---|---|
| **Outcome Summary** | SO1–SO5 by academic year: % of students at or above the threshold vs. the program target. Green = target met, red = below target, yellow = scheduled but no data. "+ Action" on a red cell starts an improvement action. The **Scheduled but Missing** list compares against the ABET Assessment Schedule (2023–24 to 2025–26) and the six-year cycle in the Curriculum Planner for later years. |
| **Improvement Actions** | Closes the loop: finding → change → owner → date → status → follow-up result. |
| **PEO Surveys & Advisory Board** | Import alumni or employer survey results (CSV or Excel; any column with PEO1…PEO5 in the header is scored, using 1–5 or Strongly agree…Strongly disagree). Click **Download Template** for a starter file. Only totals and comments are saved. Record advisory board meetings, which PEOs were reviewed, and link them to improvement actions. |
| **Self-Study Tables** | Download a real Excel workbook or Word document with the SO-to-course map, the outcome summary, every assessment result, the PEO-to-SO map, actions, advisory meetings, and survey results. |
| **Historical Data** (admin) | Adds past results from SO 3 Data.xlsx, Student Outcome 5 Data.xlsx, and the Spring 2023 capstone results workbook. Tick rows and click **Import Selected**; nothing is added automatically. The SO 3 workbook never had pass counts filled in, so type them in under "Imported Historical Results". |
| **Settings** (admin) | The **individual threshold (70%)** and **program target (75%)** are set here, once. Analytics, reports, the Criterion 4 insert, and the semester closeout all use these values. You can also type in the PEO wording. |

Other pages are under **Advanced tools** in the menu: Analytics, Curriculum Planner, ABET Assignment Mapping, Syllabus & Semester (where you assign instructors to courses each term, which drives My Courses), Calendar, Meeting Notes, Administration, and System Health (backups).

## Good habits

- The top bar shows **Saved 2:31 PM** after each real save. If a save fails, a red banner appears and the bar says **NOT saved**. Don't close the page; check your connection and try again.
- Download a backup from **System Health** before big changes and at the end of each semester, then use **Reports → Semester Closeout** to save the ZIP in OneDrive.
- Student names and IDs are FERPA-protected. Share exports only with program faculty, and use the summary tables (no names) for the self-study.

## Previewing locally (no changes to the live site)

```
cd ABET-and-ASSESSMENT-HUB
python3 -m http.server 8000
```
Open http://localhost:8000/. It signs in to the same Firebase project as the live site, so anything you save goes to the real workspace.

## For maintainers

- Data lives in one Firestore document, `abetHubs/etde-main` (field `hubData`). v5.2 only **adds** fields: `improvementActions`, `peoSurveys`, `advisoryMeetings`, `historicalResults`, `settings.peoList`, and `settings.programTarget`/`sloThreshold`. Older data loads unchanged.
- To rebuild the historical seed and schedule after the spreadsheets change: `python3 tools/build_seed.py "/path/to/ABET files"`.
- Smoke test with Firebase mocked: start the server above on port 8765, then `npm i playwright && node tools/smoke-test.js`.
- SheetJS 0.20.3 and JSZip are served from `assets/vendor/`, not a CDN.
- Known limits: last save wins if two people save at the same moment, and Firestore caps the single record at 1 MB. Moving to OSU Microsoft 365 sign-in and storage is planned separately.
