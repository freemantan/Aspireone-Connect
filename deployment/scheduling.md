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

## Add Class sessions and grant review

The creation tab is named Add Class. Each successful Add class action creates a separate record and keeps entered fields for the next addition. Edit A Class remains available for changes to saved records. Its preview includes only classes added during the current uninterrupted visit to Add Class, grouped by branch and term, and excludes existing branch classes. Cancel clears the entry and keeps the visit's saved classes. Return opens Find A Class and ends the visit; choosing another scheduling tab, leaving Scheduling, or reloading also ends it. Saved database records remain available in Find and Edit.

Member Access includes Check access granted, with member/business-role and branch filters. It lists recorded direct branch and all-branch grants, includes inherited business-role grants when filtering a member, omits revoked all-branch grants, and retains the existing server-managed visibility boundaries. No database migration or permission expansion is required for this interface update.

## Edit Class timetable

Apply `deployment/supabase-scheduling-v3.sql` when upgrading an existing installation. It adds recoverable deletion/restoration with the same branch authorization, record-revision checks and audit history as other changes. No member access is changed.

Edit Class starts with Find A Class: zone, one permitted branch, one level, subjects, year and term. Search displays the entire selected branch week for that term, highlighting matching classes. Click a class to edit its details. Move or Copy selects a destination using a timetable slot or direct day/time inputs; drag-and-drop also prepares a move. Destination selection preserves duration and requires explicit Save move or Save copy before any change is written. Copy creates a new record; Move updates the existing one. Classes without times can be completed through details. Delete requires an inline confirmation, removes the class from the timetable, and offers Restore. The Deleted classes list supports restoration after later searches or returning to Edit Class. Stale saves retain the entered details; Reload class explicitly fetches the latest record.

## Coach search and Find A Class layout

Edit Class Search now applies branch, level, subjects, year/term and optional coach criteria to displayed results. Coach accepts case-insensitive names or initials and offers an autocomplete list. Disabled Search explains which selection is missing; empty branch/term and no-match cases provide explicit messages. Recorded deleted classes remain available through the same filters for restoration.

The weekly display now uses the same Level / Subject rows and Monday–Sunday columns as Find A Class. Time appears inside each class card; the time-axis and slot buttons are removed. Move/Copy use the class details' day/start/end controls. Dragging a class to another weekday preserves its original time and still requires review/save.

## Compact period filters and subject selection

Edit Class keeps Level in its existing half-width position. Academic year and Term share the other half in a compact two-column group. Find A Class and Edit Class begin with no subjects selected; All subjects selects/deselects the full list and becomes unchecked when any one subject is unchecked. Search is enabled after at least one subject is selected.

## Action-first timetable controls

After Search, Edit Class presents Edit, Move, Copy and Delete above the weekly schedule. No action is preselected. Edit opens the class-details form only after a class is clicked. Move/Copy require selecting a class before dragging it to another weekday; the time is preserved and a compact confirmation appears without the details form. Clicking a destination weekday or pressing Enter on its cell provides the keyboard alternative. Cancel discards a pending action. Delete opens only the Delete class / Keep class confirmation. A Refresh timetable control loads current records after a conflict; branch permission and revision checks remain enforced on the server. No database migration is required.

## All levels and Find A Class Coach search

Find A Class and Edit Class offer All levels in the Level dropdown. It removes only the level restriction; branch, subjects, coach and Edit Class period/access restrictions still apply. Subject options span the chosen branches when All levels is selected. Find A Class now offers the same optional Coach autocomplete/name-or-initials search as Edit Class, including case-insensitive matching and reset behavior.

The shared form's text-input rule excludes checkbox inputs. Edit Class Subjects is a full-width section below Coach, with an aligned checkbox grid and a separate All subjects row. Level and the compact Academic year/Term pair retain their positions.

## Business role access popup

Apply `deployment/supabase-scheduling-v4.sql` on existing databases. Selecting Assign to → Business role opens one modal listing every business role and its current all-branch access. Each row offers No additional access, Viewer, Editor or Manager. Save role access submits only changed roles in one database transaction; any stale revision or invalid row rolls back all changes. Cancel/Escape do not save. Reload access explicitly discards popup edits and reloads current grants. Only existing all-branch Managers/Administrators can open or save role access; individual branch grants remain separate. Opening the popup or installing the migration grants no access automatically.
