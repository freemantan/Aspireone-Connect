import { readFileSync, writeFileSync } from 'node:fs';

// Keep the generated entry point and assets, but remove preview-only resources.
const path = 'dist/server/wrangler.json';
const config = JSON.parse(readFileSync(path, 'utf8'));
config.name = 'aspireone-connect';
config.workers_dev = true;
// Preserve dashboard-managed variables across Git-triggered deployments.
// API credentials must still be configured as Worker Secrets.
config.keep_vars = true;
delete config.routes;
delete config.d1_databases;
delete config.r2_buckets;
config.vars = {
  APP_ORIGIN: 'https://connect.aspireone.ai',
  SUPABASE_URL: 'https://muernewfqveolaxuggot.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_mNczdLS4FP9AuFqo6CBTWQ_AhAaYOCr',
  ADMIN_EMAILS: 'freeman@aspirehub.com',
  DEMO_MODE: 'false',
  UPLOAD_LIMIT_MB: '25',
  INVITE_FROM: 'AspireOne Connect <invites@notifications.aspireone.ai>',
};
config.observability = { enabled: true };
writeFileSync(path, JSON.stringify(config, null, 2) + '\n');
console.log('Cloudflare deployment prepared. Run the Supabase SQL setup and configure SUPABASE_SECRET_KEY before signing in.');
