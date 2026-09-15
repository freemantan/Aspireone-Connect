# Acceptance evidence — 15 September 2026

## Executed checks

- **26 domain tests passed** (`npm test`).
- **TypeScript check passed** (`npm run typecheck`).
- Final Worker/client build passed, followed by a successful Wrangler deployment dry-run (36 server modules, 24 client assets; no deployment performed).
- Live local HTTP suite passed using **four separate cookie sessions**, D1 persistence and private R2 storage, including same-record simultaneous writes (one 200, one 409) and independent-record simultaneous writes (both retained).
- The authenticated server recurrence endpoint was exercised twice: first run created the scheduled occurrence; retry created zero duplicates.
- Browser checks covered dashboard, grouped table, expandable subtasks, compact chat count, unread clearing after viewing, Kanban lanes, Calendar due-date placement, Timeline bars/dependency warning/arrows, and mobile My Tasks navigation at a 390px viewport. Mobile document width matched viewport width; the task table scrolls inside its container.
- WebMCP task-read tool registered with a read-only schema, returned the accessible-board result, and intentionally rejected an invalid board parameter. It shares the authenticated state endpoint.

## Specification scenarios

| # | Scenario | Evidence / remaining live check |
|---|---|---|
| 1 | Invited Google account, abbreviation, board isolation, uninvited denial | Invitation identity/expiry tests and board/session checks pass. Real Google callback/consent requires the OAuth client and administrator email. |
| 2 | Administrator all boards; Manage cannot create board or escalate | Domain tests plus live HTTP 403 for Manage board creation. Production initializer has six boards and no accounts/tasks. |
| 3 | View Marketing / Edit Ops independently | Domain test and distinct demo Viewer session; Directors excluded from state. |
| 4 | View group/chat/upload; only own status/remark | Live group/post/reply/upload succeeded; forbidden title edit returned 403. Domain checks cover assignee/date/priority/supporting-member restrictions. |
| 5 | Editor task/subtask; manager columns/statuses | Domain tests cover one subtask level, primary/supporting assignments, manager schema access, archived custom values and status replacement. |
| 6 | Shared records and failed-save reporting | All views derive from one authenticated snapshot. Browser views reviewed; HTTP persisted refresh verified; stale saves return 409. Inline failed drafts display Not saved. |
| 7 | Empty chat +, total message/reply count, unread clearing | Domain/live count tests with attachments; browser subtask plus and task count inspected; unread suffix cleared after opening chat. |
| 8 | Mention deduplication and revoked attachment denial | Domain notification deduplication and live revoked old-file URL returned 403; confidential records absent from returned snapshot. |
| 9 | Independent parent/subtask completion and Singapore overdue | Domain tests require parent warning confirmation, retain child status, and test due-today/Singapore midnight. |
| 10 | Weekly/monthly recurrence, downtime, no duplicates | Domain tests cover February/month-end, weekly backfill, pause/end, subtask remapping and bounded retries; local server endpoint retry passed. Hosted cron delivery awaits deployment. |
| 11 | Dependencies warn, allow completion, reject cycles/self/cross-board | Domain tests pass; Timeline dependency warning and arrow surface inspected. |
| 12 | Calendar/Gantt dates, undated list, date permissions | Browser due placements/bars/unscheduled sections checked. Date edits share the server task-update gate. View date mutations rejected in domain tests; date dragging offered only to editors. |
| 13 | Dashboard counts/filter links/access/archive/subtask separation | Dashboard derives totals and linked rows from the same filtered array. Browser demo totals 5 parent tasks: 2 open, 2 active, 1 completed, 1 overdue; subtask toggle separated. |
| 14 | Persisted chats/files, invalid uploads, concurrent updates | Live upload/download content matched, invalid executable failed, relogin retained records; same-record and independent-record concurrency checks passed. |
| 15 | Archive/restore preserves children/chats/files; revoke removes all views | Domain hierarchy/archive tests plus live archive/restore and revoked snapshot checks across tasks/groups/chats/files/notifications. Old invitation cancelled on revoke. |

## Not represented as completed

Real Google sign-in, actual invitation delivery, production hosting, production private bucket/database access, and Cloudflare's hosted cron execution are **not validated or deployed**. Their application code and configuration are provided. They require the actual launch inputs and the final live smoke test described in DEPLOYMENT.md.

The browser exercises were targeted acceptance checks, not a full automated cross-browser or screen-reader certification. The small-team storage design has not been load-tested for enterprise-scale task/message volumes.

## Reproducibility

Use `npm test`, `npm run typecheck`, `npm run build`, then run `npm run test:http` against the local demo. Include `TEST_CRON_SECRET=local-preview-test-only` for a checkout initialized with the supplied local setup script. The HTTP suite archives its test group; it never uses real staff identities or sends invitation email.
