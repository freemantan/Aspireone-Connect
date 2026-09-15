import {build} from 'esbuild';
import {spawnSync} from 'node:child_process';
await build({entryPoints:['tests/domain.test.ts'],outfile:'.sites-runtime/domain-tests.mjs',bundle:true,platform:'node',format:'esm'});
const result=spawnSync(process.execPath,['--test','.sites-runtime/domain-tests.mjs'],{stdio:'inherit'});process.exit(result.status||0);
