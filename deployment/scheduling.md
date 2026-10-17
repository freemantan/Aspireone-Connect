# Schedule editing and member access

Scheduling sits after Business Planning. The shared schedule page is generated from `scripts/templates/schedule-review.html.template` and `schedule-editor.js` into `public/schedules/index.html` and the local review file.

## Activate in Connect

Apply the generated `deployment/supabase-schedules-install.sql` to the existing Connect Supabase database, which must already contain `ao_workspace`. This installs the schedule schema, PDF-derived seed and editing functions. For a database that already has the schema and seed, apply only `deployment/supabase-schedule-editing.sql`. Deploy the updated Connect application. Neither step has been performed by this local change.

Use the existing server-only `SUPABASE_URL` and `SUPABASE_SECRET_KEY`; never expose the secret key to the schedule page. The iframe calls `/api/scheduling` with the Connect session cookie. Standalone local files remain read-only and show a sign-in message under Edit A Class.

An existing active Administrator opens Scheduling → Edit A Class → Member access and assigns branch permissions to existing active Connect members. Membership is separate from board membership. Viewer can search; Editor can add, update and discontinue classes; Manager can do the same and assign Viewer, Editor or Manager access within their managed branches. Administrators have access to every branch. No Zone Manager role is introduced. Setting Viewer removes editing and management permission. Inactive and onboarding members cannot edit.

Saves validate subject, levels, dates, times and branch access on the server and in database functions. Each update checks the original revision and stores a before/after audit record in the same transaction. Concurrent edit conflicts preserve the form; Reload class loads the latest record. Discontinued classes are excluded from searches and remain available to authorized editors for restoration. The original PDF evidence is retained. Source imports preserve CRE edits and classes created in Connect.

## Verification

- `node tests/scheduling-page.cjs` checks Find A Class, the AV PDF fixture, subject aliases and role-specific editing screens.
- With TypeScript 5.9 installed: `SCHEDULE_TYPESCRIPT=/path/to/typescript node tests/scheduling-api.cjs`.
- With PGlite installed: `SCHEDULE_PGLITE=/path/to/@electric-sql/pglite node tests/scheduling-sql.mjs` runs the actual migration and permission/save scenarios in a local PostgreSQL engine.
- Run `tests/schedule-import.py` with the bundled Python runtime for extraction and import-preservation checks.

Live authentication and deployment require a separate smoke check after installation: sign in as Administrator, assign a branch Editor and Manager, save a class, search for it, then verify that a Viewer and an Editor assigned to another branch cannot save it.

## Create Class and all-branch access

Apply `deployment/supabase-scheduling-v2.sql` after the original editing migration when upgrading an existing database. New installations use the combined installation script. The upgrade grants no new member or role access automatically.

Tabs are Find A Class, Edit A Class, Create Class and Member Access (at the right). Create Class retains the form after saving and shows the saved class in the branch Monday–Sunday timetable. Save changes updates that class; Add another class creates a separate record using the currently entered details.

Member Access supports individual branch assignments and all-branch grants to an active member or business role. All-branch Managers can assign access across branches, including all-branch grants. Branch Managers can only assign access within branches they manage. Access is the greatest applicable branch, all-branch member or all-branch business-role grant; a branch Viewer assignment does not cancel inherited editing rights. No all-branch grant removes that specific grant while retaining any other applicable grants.
