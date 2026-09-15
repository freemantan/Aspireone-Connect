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

The app now uses Supabase Auth, PostgreSQL and private Storage through the Worker.
Follow SUPABASE-ACTIVATION.md to run the database script, configure the Worker
secret, and allow the callback URLs. Pilot testing is required before staff rollout.
No secret keys are included.
Keep the workers.dev address for deployment checks before connecting the domain.

App: https://connect.aspireone.ai
Supabase: https://muernewfqveolaxuggot.supabase.co
Administrator: freeman@aspirehub.com
