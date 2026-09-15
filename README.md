# AspireOne Connect

A working internal collaboration portal implementing the accompanying MVP specification. The source specification and reference screenshots remain untouched in the parent folder.

## Current status

The local demonstration runs at **http://localhost:5173/** while its preview process is running. Choose Administrator, Viewer, Editor or Manager on the sign-in page. These are fictional `example.test` accounts in a separate local D1 database, with attachments in local private R2 emulation. The Viewer has View access to Marketing and Edit access to Ops. Directors is administrator-only in the demo.

**This is not a deployed company system.** Google OAuth, invitation email delivery, the production domain and hosted scheduler need the launch inputs below. No real staff accounts or tasks have been invented for production. The production initializer creates exactly the six boards, with no groups or tasks.

The current preview runtime is `/private/tmp/aspireone-connect-runtime`, outside OneDrive. OneDrive offloaded development files during testing; use a normal local folder for installation and execution. The deliverable source remains in the project folder, with a ZIP copy for reliable transfer. Temporary runtime folders may be cleared by macOS.

## Run locally

Requires Node.js 22.13 or newer; validated with Node.js 24.12.

1. Extract the source ZIP into a local folder outside OneDrive, iCloud or another on-demand sync folder.
2. Run `npm ci`.
3. On a **new local database only**, run `npm run setup:local`. This builds the Worker, creates local-only demo settings, and applies the SQL migration.
4. Run `npm run dev` and open the Local URL printed by the server, normally `http://localhost:5173/`.
5. Use one of the four demonstration accounts. The demo is seeded only when the first demo login happens. Restarting preserves the local database and files.

For an already initialized checkout, just run `npm run dev`. Do not replay the initial migration. Keep `.wrangler/state` when preserving a local preview. Never upload that directory to production.

Checks:

```sh
npm test
npm run typecheck
npm run build
npm run test:http
```

The HTTP suite requires the running **demo** server and creates only local acceptance data; it archives its test group afterward. Set `TEST_CRON_SECRET=local-preview-test-only` when using the local setup defaults to include the scheduler endpoint checks. Tests use separate cookie sessions and validate denial responses, persistence, private downloads, revocation and concurrent writes.

## What is implemented

- Google authorization-code login with PKCE, state, nonce, signed ID-token verification, verified email checks, invitation matching, hashed server sessions, sign-out and inactive-account checks.
- Six initial boards; administrator-only board management; independent View/Edit/Manage memberships; seven-day invitation lifecycle with cancellation, expiry, resend, matching-account acceptance and Resend delivery.
- Board → group → task → one-level subtask hierarchy, inline status/remark/date/assignee updates, supporting members, priorities, descriptions, links, custom columns, configurable status classification, archive and restore.
- Table, Kanban with drag and keyboard status control, month/week Calendar, Timeline/Gantt with dependency arrows, date dragging for editors, full-screen task details, My Tasks and supporting assignments.
- Common filters, search, sort, personal column visibility, group collapse, parent/subtask counts and permission-filtered management dashboard.
- Board discussion topics and task chats, replies, mentions, compact total-message count plus independent unread marker, message editing/moderation, recoverable removal, private uploads and downloads, image/PDF preview links, preserved drafts and upload progress.
- In-app assignment/supporting/mention/participant notifications with recipient deduplication and access rechecks.
- Weekly/monthly recurrence with Singapore date calculations, month-end clamping, captured future templates, independent occurrences, subtask date offsets and dependency remapping, pause/resume/end, downtime catch-up and idempotent retries.
- Server-enforced permissions, same-origin mutation checks, optimistic record revisions, atomic database writes, six-second polling, audit records and visible save failures.

Calendar and Gantt date changes also remain available through task details as the keyboard alternative. Gantt does not automatically reschedule dependencies. Archived work is restored before editing. Custom column types are fixed after creation; archive a column and add a new one to change its type.

## Production launch

Read [DEPLOYMENT.md](DEPLOYMENT.md) for the exact sequence. Required inputs are:

| Input | Purpose |
|---|---|
| Real initial administrator email | Bootstrap the first administrator after verified Google sign-in |
| Google OAuth client ID and client secret | Real Google login |
| Production domain and Cloudflare account | HTTPS application hosting |
| Production D1 database ID | Shared persistent records |
| Private R2 bucket name | Private attachments |
| Resend API key and verified invitation sender | Invitation emails |
| A randomly generated scheduler secret | Authenticate the separate scheduled Worker |
| Staff emails and preferred abbreviations | Invite staff after the administrator signs in |

The provided hosting configuration targets Cloudflare Workers, D1 and R2. It uses the Sites-compatible starter, but the requested Google identity flow is app-owned and the launch guide uses a direct company Cloudflare deployment. A private Sites publication would add a separate platform access gate and is not treated as a substitute for the requested company login. No public or private live deployment has been performed.

## Implementation map

- `app/page.tsx`, `app/globals.css`: shared interface and all views.
- `app/api/[...path]/route.ts`: authenticated API, upload/download gates, invitation delivery and recurrence endpoint.
- `lib/model.ts`: permission policy, domain validation, mutation rules, notifications, recurrence.
- `lib/auth.ts`: Google OAuth and server sessions.
- `lib/store.ts`: D1 record repository and atomic revision-controlled transactions.
- `lib/demo.ts`: isolated fictional demo fixtures, never called from production login.
- `db/schema.ts`, `drizzle/`: versioned schema and migration.
- `deployment/`: production inputs and scheduled Worker configuration.
- `tests/`: domain and live local acceptance checks.

For this approximately 15-user MVP, the server reads a workspace snapshot from indexed record rows, filters it before returning it, and applies only changed rows. A global revision check inside a transactional D1 batch prevents concurrent writes from losing updates; record versions reject stale user edits. This favors simple, auditable permission behavior over large-enterprise scale. Growing to a large task/message history will require paginated board-scoped queries and more granular transactions. Load testing at that scale is not claimed.

See [ACCEPTANCE.md](ACCEPTANCE.md) for evidence and the live-service checks still awaiting credentials.
