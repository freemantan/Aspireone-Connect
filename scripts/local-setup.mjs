import {existsSync,writeFileSync,readdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
function run(args){const r=spawnSync(process.execPath,args,{stdio:'inherit'});if(r.status)process.exit(r.status);}
if(!existsSync('.env.local'))writeFileSync('.env.local','DEMO_MODE=true\nUPLOAD_LIMIT_MB=25\nCRON_SECRET=local-preview-test-only\n');
run(['scripts/run-framework.mjs','build']);
for(const file of readdirSync('drizzle').filter(x=>x.endsWith('.sql')).sort()){
 const result=spawnSync(process.execPath,['--import','./scripts/sites-env.mjs','./node_modules/wrangler/bin/wrangler.js','d1','execute','DB','--local','--config','dist/server/wrangler.json','--persist-to','.wrangler/state','--file','drizzle/'+file],{stdio:'inherit'});
 if(result.status){console.error('Migration failed. If already initialized, use npm run dev; do not replay migrations.');process.exit(result.status);}
}
console.log('Local demonstration database initialized. Run npm run dev. Production is separate and DEMO_MODE must be false.');
