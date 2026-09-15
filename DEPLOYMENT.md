# Production deployment and operations

## Launch inputs

Supply the real company domain, initial administrator email(s), Cloudflare account, new production D1 database, private R2 bucket, Google OAuth web-client credentials, and Resend verified sender/API key. Store service secrets in the hosting platform, not in source files or chat messages. No existing credentials were discovered or reused.

The production database and bucket must be separate from `.wrangler/state` and the preview fixtures. Set `DEMO_MODE=false`; additionally, the demo-login route checks for a loopback hostname. Do not import local demonstration data.

## 1. Build and provision

Use the source in a local folder outside cloud-sync on-demand storage. Authenticate Wrangler with the intended Cloudflare account, then provision a new D1 database and private R2 bucket. Leave R2 public access and public bucket URLs disabled.

```sh
npm ci
npm test
npm run typecheck
npm run build
npx wrangler d1 create aspireone-connect-production
npx wrangler r2 bucket create aspireone-connect-private-production
```

Copy `deployment/inputs.example.json` to a private local input file. Replace every placeholder with the real domain, D1 ID, bucket name, administrator email(s), and sender. Then:

```sh
node scripts/prepare-production.mjs /absolute/path/to/production-inputs.json
```

This writes `dist/server/wrangler.production.json` from the current built Worker configuration, preserving its output paths. It sets the company custom domain, production bindings, explicit non-demo mode and operational logging. It does not deploy anything. Re-run this after each build because `dist/` is generated.

## 2. Google sign-in

Create a Google OAuth **Web application** client. Configure the consent screen for the intended company users. The redirect URI must match exactly:

```text
https://YOUR_PRODUCTION_DOMAIN/api/auth/callback
```

The app requests only `openid email profile`. It verifies Google's RSA signature, issuer, audience, expiry, nonce and verified-email claim. Google sign-in alone never grants board membership. A matching pending invitation can create the account; the user then accepts that invitation. Configured initial administrators can sign in without an invitation. Subsequent role changes are performed in Administration and are not overwritten by the bootstrap email list.

Set the Worker secrets interactively:

```sh
npx wrangler secret put GOOGLE_CLIENT_ID --config dist/server/wrangler.production.json
npx wrangler secret put GOOGLE_CLIENT_SECRET --config dist/server/wrangler.production.json
npx wrangler secret put RESEND_API_KEY --config dist/server/wrangler.production.json
npx wrangler secret put CRON_SECRET --config dist/server/wrangler.production.json
```

Use the same long, randomly generated CRON_SECRET for the app and scheduler. `APP_ORIGIN`, `ADMIN_EMAILS`, `INVITE_FROM` and `UPLOAD_LIMIT_MB` are written as server variables by the production configuration script. `APP_ORIGIN` must be the exact HTTPS origin with no trailing slash.

Google setup reference: https://developers.google.com/identity/openid-connect/openid-connect

## 3. Database migration and application deployment

Review the SQL migration before applying it. Apply it to the new production database and keep Wrangler's migration history. Never seed production with `lib/demo.ts`.

```sh
npx wrangler d1 migrations apply DB --remote --config dist/server/wrangler.production.json
npx wrangler deploy --config dist/server/wrangler.production.json
```

The first verified Google login initializes the six boards once. The initial administrator then adds themselves to any board where they need task assignments, invites staff from Members, and staff accept using the matching Google email.

## 4. Invitation email

Verify the sender domain with Resend, including its required DNS records, then use an approved sender in `INVITE_FROM`. The app sends invitation emails through Resend's HTTPS API. Delivery failures remain visible as `failed` on the invitation; use Resend after fixing the service configuration. Cancellation or resend invalidates the old token. Revocation cancels outstanding invitations for that board/account, preventing an old invitation from restoring access.

No real invitation emails were sent during development. The local demo suppresses email transmission.

## 5. Server-side scheduler

Edit `deployment/scheduler.wrangler.jsonc` to use the real `APP_ORIGIN`. Set its secret and deploy:

```sh
npx wrangler secret put CRON_SECRET --config deployment/scheduler.wrangler.jsonc
npx wrangler deploy --config deployment/scheduler.wrangler.jsonc
```

The scheduler runs every five minutes, with no browser required. It calls the authenticated app endpoint. Date evaluation uses Asia/Singapore even though Cloudflare's cron expression uses UTC. Missed active dates are processed in bounded batches, with occurrence IDs preventing duplicates. A long backlog can take several runs. Monitor scheduled invocation failures; the Worker throws on an unsuccessful response so Cloudflare records the failure.

Cron reference: https://developers.cloudflare.com/workers/configuration/cron-triggers/

## 6. Verify before inviting the company

With distinct real Google sessions, verify the configured administrator, invited matching email, uninvited email denial, expired/cancelled invitation denial, View on one board and Edit on another, and Directors privacy. Upload an allowed file, post it in a chat, sign out and back in, then revoke a test member and verify their old task/file URLs fail. Verify a real invitation arrives and that two scheduled runs generate only one occurrence for the same date. Repeat the acceptance matrix in `ACCEPTANCE.md` with the company accounts.

These live OAuth, email delivery, HTTPS, hosted storage and hosted cron checks cannot be completed without the launch inputs. Local tests do not certify an unconfigured hosted deployment.

## Backups and restore

Before schema changes, export D1 into a protected backup location:

```sh
npx wrangler d1 export DB --remote --config dist/server/wrangler.production.json --output /secure/backup/aspireone.sql
```

Back up **both** D1 and the private R2 bucket. D1 contains file metadata and keys; R2 contains the bytes. Use Cloudflare's supported R2 S3-compatible tooling to copy the full bucket into a restricted backup bucket or encrypted backup destination, preserving object keys. Do not enable public access for backup convenience. Arrange periodic database and object backups in the company's backup system; the application does not silently create a second cloud account or backup service.

Restore rehearsal:

1. Pause the scheduled Worker and stop writes during the backup cutover.
2. Provision a separate restore-test D1 database and private bucket.
3. Import the SQL backup into the empty test database with `wrangler d1 execute ... --remote --file ...`; do not apply the initial create-table migration on top of a full database export.
4. Restore all object keys to the test bucket and point a test deployment at those two resources.
5. Check task counts, memberships, archived records, message history and attachment downloads with authorised test accounts.
6. Clear restored `sessions` and `oauth` rows so users sign in again. Keep the real production origin out of the test scheduler configuration.
7. Resume production only after verifying both records and blobs and selecting the intended deployment bindings.

Database restore should preserve schema/migration history. Retain the original backup until the restored service is verified. Never restore a demo database into production.

## Logs and operational limits

Worker logs record unexpected API/storage errors, invitation delivery failures and scheduled-run failures. Application activity records preserve meaningful task/remark/status/member/archive changes. No service token is returned by the authenticated state API. Uploads use random private object keys, validate server-side size/type signatures, and send downloads with no-store and nosniff headers.

Default upload limit is 25 MB per file. The server accepts common image, PDF, Office, text and CSV formats; executable and HTML uploads are rejected. Private attachment access is rechecked on every request. Removed objects are retained for recovery; storage retention/purge policies are a future operational decision, not an automatic destructive job.

The MVP repository is intended for the initial small team, not an unbounded message archive. Review snapshot sizes and D1 query costs as usage grows; paginate and partition reads before scaling materially beyond this scope.
