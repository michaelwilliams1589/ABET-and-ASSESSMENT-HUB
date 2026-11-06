# OSUIT ETDE Assessment & Accreditation Hub: User Guide (v5.5)

A website for collecting ABET evidence in the Instrumentation & Automation program. Sign in with your faculty account, upload Canvas grades, and the Hub works out the student outcome (SO) results for the self-study.

## For instructors: three steps

1. **Sign in** with **Sign in with Microsoft** (your OSU account) or your email and password. Forgot it? Type your email and click **Forgot password?**. The Hub opens to **My Courses**. The first time, choose your name in "I am"; the Hub remembers it on that computer.
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

## Project Rubric (ETDE 3213 final presentation)

**Advanced tools → Project Rubric (ETDE 3213)** (also linked from My Courses). It follows the paper rubric in `assets/documents/ETDE-3213-Final-Project-Group-Rubric.pdf` (open it from the page).

- **Score a team:** team, project, date, term. Rate each group category 1–5 (or 0 = no evidence); the points come from the rubric's conversion table (max 5: 1-2-3-4-5, max 8: 2-3-5-6-8, max 10: 2-4-6-8-10, max 12: 2-5-7-10-12). Group total out of 80 is shared by the team. Add any number of students (5 rows to start) and give each 0–5 for Contribution, Project Knowledge, Presentation, and Accountability & Teamwork. Final = group + individual, out of 100.
- **Saved teams:** open a team to change it, or delete it. Each team is its own record (`projectRubrics` collection), so saving one never touches another or any other Hub data.
- **Reports & graphs:** students at or above the Hub's threshold (Settings, 70%), average points per category, group score by date, and a CSV (one row per student per outcome). Direct outcome evidence, review state, and historical proposed evidence are identified separately.
- **Current outcome mapping:** Final Project Presentation → **SO 1, SO 3, SO 5**, effective Fall 2026. The previous Email Assignment → SO 3 mapping stays inactive for historical interpretation. After deploy, an administrator uses **Outcome mapping → Use final-presentation mapping for this workspace** once for existing saved data; this changes only the Project Management mapping and does not overwrite other mappings, grades, or meetings.
- **Direct individual evidence:** enter each named student's Technical, Communication, and Teamwork rating (0–5) and a short observation of technical explanation, speech/questions, or role/leadership. The group grade is supporting context, never individual attainment by itself. Save the team, then faculty-review the saved evidence before it enters official outcome results. Any subsequent evidence edit returns the team to review-needed. Historical proposed entries remain excluded and are not upgraded automatically.
- **Attainment:** the program threshold is 70%, so a direct rating of 4 or 5 meets it; 3/5 is 60%. The program target is 75% of students assessed meeting the threshold. Reviewed totals are grouped by the teams' terms/academic years. A shared Canvas total imports as a course total, not three direct outcomes. WBS, Gantt, BOM, and economics remain course evidence without invented SOs/PIs.
- **Mapping documents:** **Outcome mapping** links the printable [ETDE 3213 outcome mapping](assets/documents/ETDE-3213-Outcome-Mapping.html) and [November 6, 2026 approval minutes](assets/documents/ETDE-3213-Mapping-Meeting-Minutes-2026-11-06.html). The minutes record Michael Williams, Darrel, Matthew, Carlos, Amanda, and Paula; Michael's motion carried unanimously. **Save minutes to Meeting Notes** requires a confirmation and adds one stable note without duplication or changes to prior records.

## Who can get in

Only people on the **approved users** list (Administration → Approved Users) can open the Hub, and the Firebase security rules enforce this on the server. New faculty click **Request Faculty Access** on the sign-in page; an administrator adds them. Instructors can't change program settings, the official assignment mapping, or imported historical data. Those are for administrators.

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

- **Firebase setup:** follow `docs/FIREBASE_SETUP_CHECKLIST.md`.
- **Storage:** after the one-time upgrade (System Health), each record is its own document under `abetHubs/etde-main/{collection}/{id}`, and settings live in `abetHubs/etde-main/meta/{name}`. Saves write only the records that changed, so people don't overwrite each other and the 1 MB limit is gone. Until the upgrade, the Hub reads and writes the old single record as before. Code: `assets/data-store.js`. Admin tools: `assets/v53-admin.js`.
- **Rules:** `firestore.rules` (same text as `FIRESTORE_RULES.txt`). Test them locally with the emulator, which needs Java and `npm i firebase-tools @firebase/rules-unit-testing firebase playwright`:
  `npx firebase emulators:exec --project demo-etde-hub --only firestore "node tools/rules.test.js"`
  End-to-end test (sign-in, migration, concurrent saves), with `python3 -m http.server 8765` running:
  `npx firebase emulators:exec --project demo-etde-hub --only auth,firestore "node tools/emulator-test.js"`
  The `demo-` project ID exists only inside the emulator, so these tests can't touch the live project.

- Before the upgrade, data lives in one Firestore document, `abetHubs/etde-main` (field `hubData`). v5.2 only **adds** fields: `improvementActions`, `peoSurveys`, `advisoryMeetings`, `historicalResults`, `settings.peoList`, and `settings.programTarget`/`sloThreshold`. Older data loads unchanged.
- To rebuild the historical seed and schedule after the spreadsheets change: `python3 tools/build_seed.py "/path/to/ABET files"`.
- Project Rubric test (scoring math, saving, reopening, reports, CSV, no overwrites): with the server on 8765, `node tools/project-rubric-test.js`.
- Smoke test with Firebase mocked: start the server above on port 8765, then `npm i playwright && node tools/smoke-test.js`.
- SheetJS 0.20.3 and JSZip are served from `assets/vendor/`, not a CDN.
- Known limit after the upgrade: if two people edit the *same* record at the same moment, the later save wins for that one record.
