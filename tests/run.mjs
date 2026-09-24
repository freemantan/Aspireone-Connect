import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/domain.test.ts'],outfile:'.sites-runtime/domain-tests.mjs',bundle:true,platform:'node',format:'esm'});
await build({entryPoints:['tests/supabase.test.ts'],outfile:'.sites-runtime/supabase-tests.mjs',bundle:true,platform:'node',format:'esm',plugins:[{name:'test-worker-env',setup(b){b.onResolve({filter:/^cloudflare:workers$/},()=>({path:'env',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'globalThis.__supabaseEnv ??= {}; export const env = globalThis.__supabaseEnv;',loader:'js'}));}}]});
await build({entryPoints:['tests/planning.test.ts'],outfile:'.sites-runtime/planning-tests.mjs',bundle:true,platform:'node',format:'esm'});
const result=spawnSync(process.execPath,['--test','.sites-runtime/domain-tests.mjs','.sites-runtime/supabase-tests.mjs','.sites-runtime/planning-tests.mjs'],{stdio:'inherit'});process.exit(result.status||0);
