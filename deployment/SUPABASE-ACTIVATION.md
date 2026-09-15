# Activate Supabase

1. Open Supabase project muernewfqveolaxuggot → SQL Editor → New query.
   Paste all of deployment/supabase-setup.sql and Run. Re-running preserves records.
2. Supabase → Settings → API Keys → copy the secret key (sb_secret_...).
   Cloudflare → Workers & Pages → aspireone-connect → Settings → Variables and
   Secrets → Add → type Secret → name SUPABASE_SECRET_KEY. Paste there and deploy.
   Do not put this key in GitHub source, build variables, or chat.
3. Supabase → Authentication → URL Configuration → Redirect URLs: add both exact URLs:
   - https://aspireone-connect.freeman-d5f.workers.dev/api/auth/callback
   - https://connect.aspireone.ai/api/auth/callback
   Site URL remains https://connect.aspireone.ai.
4. Google Auth Platform redirect URI remains
   https://muernewfqveolaxuggot.supabase.co/auth/v1/callback.
5. Test Google login as freeman@aspirehub.com on the workers.dev address first.
   The first allowed login initializes six empty boards. Other users need an
   active invitation. Creating a Supabase Auth account alone grants no portal access.
6. Add RESEND_API_KEY as a Worker secret before sending invitations. Verify the
   notifications.aspireone.ai sending domain and test delivery with pilot users.

The Worker checks access on every request and mediates all database and file
access. Browser roles are denied direct database access by grants and RLS. Files
are private and downloaded through the permission-checked API. Sessions expire
after 12 hours and account revocation takes effect on the next request.

The initial Postgres implementation stores a versioned workspace JSON snapshot
and uses an atomic revision check to prevent lost updates. It is suitable for a
small pilot; it is not yet a normalized relational schema or a large-workspace
design. Existing D1 preview data is not imported. Historical D1 auth/store files
are retained but the application API now imports the Supabase implementation.

Recurrence logic remains available at POST /api/scheduler. Automated scheduling
still needs a scheduler and CRON_SECRET; this change does not enable recurring
jobs. Configure and test backups, scheduling, file permissions and pilot roles
before staff rollout. Database backups alone do not back up Storage file bytes.
