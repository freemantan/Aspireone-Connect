# Cloudflare Builds

Repository: freemantan/Aspireone-Connect. Production branch: main.

- Root directory: repository root
- Build command: `npm run build:cloudflare`
- Deploy command: `npm run deploy`
- Node version: 22. Set the build variable NODE_VERSION to 22 if needed.
- Worker name: aspireone-connect

Cloudflare installs dependencies from package-lock.json before the build.
The build runs type checking and domain tests before compiling the app.
The deploy command uses the generated server configuration, rather than looking
for a missing root Wrangler file. Preview D1/R2 resources are removed.

This release publishes the app shell only. The backend still needs migration to
Supabase Auth, PostgreSQL and Storage. Do not invite staff yet. Setting a
SUPABASE_URL alone does not implement that migration. No secret keys are included.
Keep the workers.dev address for deployment checks before connecting the domain.

App: https://connect.aspireone.ai
Supabase: https://muernewfqveolaxuggot.supabase.co
Administrator: freeman@aspirehub.com
