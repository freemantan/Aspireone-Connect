import {ensureKnowledge} from '../lib/business-roles';
import {test,beforeEach} from 'node:test';
import assert from 'node:assert/strict';
import {login,callback,identity,hash} from '../lib/supabase-auth';
import {transact} from '../lib/supabase-store';
import {initial} from '../lib/model';
const globals=globalThis as any;
const realFetch=globalThis.fetch;
beforeEach(()=>{globals.__supabaseEnv.SUPABASE_URL='https://test.supabase.co';globals.__supabaseEnv.SUPABASE_PUBLISHABLE_KEY='sb_publishable_test';globals.__supabaseEnv.SUPABASE_SECRET_KEY='sb_secret_test';globals.__supabaseEnv.ADMIN_EMAILS='freeman@aspirehub.com';});
test('login stores hashed state and binds PKCE to an HttpOnly cookie',async()=>{
 let data:any;
 globalThis.fetch=async(url,options)=>{assert.equal(String(url),'https://test.supabase.co/rest/v1/rpc/ao_oauth_put');data=JSON.parse(String(options?.body));assert.equal(new Headers(options?.headers).get('apikey'),'sb_secret_test');return Response.json(true);};
 try{const response=await login(new Request('https://portal.example/api/auth/login'));const cookie=response.headers.get('set-cookie')!;assert.match(cookie,/HttpOnly/);assert.match(cookie,/Secure/);const token=cookie.split(';')[0].split('=')[1];assert.equal(data.token_hash,await hash(token));const url=new URL(response.headers.get('location')!);assert.equal(url.searchParams.get('provider'),'google');assert.equal(url.searchParams.get('redirect_to'),'https://portal.example/api/auth/callback');assert.equal(url.searchParams.get('code_challenge_method'),'s256');assert.ok(data.data.verifier.length>=43);}finally{globalThis.fetch=realFetch;}
});
test('callback rejects absent browser cookie before making network requests',async()=>{
 globalThis.fetch=async()=>{throw new Error('Unexpected request');};
 try{await assert.rejects(callback(new Request('https://portal.example/api/auth/callback?code=stolen')),/Login expired/);}finally{globalThis.fetch=realFetch;}
});
test('verified but uninvited Google account cannot obtain an app session',async()=>{
 const state=initial();ensureKnowledge(state);let sessionCreated=false;
 globalThis.fetch=async(url)=>{const path=new URL(String(url)).pathname;if(path.endsWith('ao_oauth_take'))return Response.json({verifier:'v',invite:''});if(path.endsWith('/token'))return Response.json({access_token:'verified-jwt'});if(path.endsWith('/user'))return Response.json({id:'unknown',email:'unknown@example.test',email_confirmed_at:'2026-01-01',identities:[{provider:'google'}]});if(path.endsWith('ao_load'))return Response.json({state,revision:0});sessionCreated=true;throw new Error('Unexpected session write');};
 try{await assert.rejects(callback(new Request('https://portal.example/api/auth/callback?code=valid',{headers:{cookie:'ao_oauth=browser-state'}})),/Access unavailable/);assert.equal(sessionCreated,false);}finally{globalThis.fetch=realFetch;}
});
test('inactive user is rejected even with a valid stored session',async()=>{
 const state=initial();ensureKnowledge(state);state.users.push({id:'u',active:false});
 globalThis.fetch=async(url)=>Response.json(String(url).endsWith('ao_session_get')?'u':{state,revision:0});
 try{await assert.rejects(identity(new Request('https://portal.example/api/state',{headers:{cookie:'ao_session=token'}})),/Access unavailable/);}finally{globalThis.fetch=realFetch;}
});
test('a revision conflict retries against the latest state without losing another save',async()=>{
 let revision=0;const state=initial();ensureKnowledge(state);let commits=0;
 globalThis.fetch=async(url,options)=>{if(String(url).endsWith('ao_load'))return Response.json({state,revision});const body=JSON.parse(String(options?.body));commits++;if(commits===1){state.groups.push({id:'other'});revision++;return Response.json(false);}assert.equal(body.expected_revision,1);assert.deepEqual(body.new_state.groups.map((g:any)=>g.id),['other','mine']);return Response.json(true);};
 try{await transact(s=>{s.groups.push({id:'mine'});});assert.equal(commits,2);}finally{globalThis.fetch=realFetch;}
});

// Business Planning uses the same authenticated server boundary as Connect.
test('planning rejects cross-entity writes and preserves draft version checks',async()=>{
 const {planningAPI}=await import('../lib/planning-api');const {seedRules}=await import('../lib/planning-seed');const {budgetTemplate}=await import('../lib/planning');
 const state=initial();ensureKnowledge(state);const u={id:'planner',active:true,roles:[]};state.users.push(u);state.members.push({id:'m',board:'board-1',user:u.id,role:'Edit'});
 const entity={id:'c0000000-0000-4000-8000-000000000001',board_id:'board-1',name:'Branch one'},hidden={id:'c0000000-0000-4000-8000-000000000002',board_id:'board-2',name:'Branch two'};
 const rule={id:'c0000000-0000-4000-8000-000000000003',status:'published',payload:seedRules};let writes=0;
 globalThis.fetch=async(url,opts)=>{const path=new URL(String(url)).pathname;if(path.endsWith('ao_load'))return Response.json({state,revision:1});if(path.endsWith('ao_commit'))return Response.json(true);if(path.endsWith('ao_plan_entities'))return Response.json([entity,hidden]);if(path.endsWith('ao_plan_rules'))return Response.json([rule]);if(path.endsWith('ao_plan_save')){writes++;const p=JSON.parse(String(opts?.body));assert.equal(p.p_actor,u.id);assert.equal(p.p_data.entity_id,entity.id);assert.equal(p.p_data.status,'draft');return Response.json({id:'saved',...p.p_data,revision:1});}throw Error('Unexpected request '+path);};
 const post=(data:any)=>new Request('https://portal.example/api/planning',{method:'POST',body:JSON.stringify({kind:'budget',data})});
 const data={entity_id:entity.id,rule_id:rule.id,name:'Plan',year:2027,status:'draft',payload:budgetTemplate()};
 try{await assert.rejects(planningAPI(post({...data,entity_id:hidden.id}),u),/access/);await assert.rejects(planningAPI(post({...data,status:'published'}),u),/Manage/);assert.equal(writes,0);await planningAPI(post(data),u);assert.equal(writes,1);}finally{globalThis.fetch=realFetch;}
});
test('planning filters reads to accessible entities and published shared rules',async()=>{
 const {planningAPI}=await import('../lib/planning-api');const state=initial();ensureKnowledge(state);const u={id:'reader',active:true,roles:[]};state.users.push(u);state.members.push({id:'m',board:'board-1',user:u.id,role:'View'});
 const eid='c0000000-0000-4000-8000-000000000001';
 globalThis.fetch=async(url)=>{const parsed=new URL(String(url)),path=parsed.pathname;if(path.endsWith('ao_load'))return Response.json({state,revision:1});if(path.endsWith('ao_commit'))return Response.json(true);if(path.endsWith('ao_plan_entities'))return Response.json([{id:eid,board_id:'board-1'},{id:'hidden',board_id:'board-2'}]);if(path.endsWith('ao_plan_rules')){assert.equal(parsed.searchParams.get('status'),'eq.published');return Response.json([]);}if(path.endsWith('ao_plan_budgets')){assert.equal(parsed.searchParams.get('entity_id'),'in.('+eid+')');return Response.json([]);}throw Error('Unexpected request');};
 try{const data=await planningAPI(new Request('https://portal.example/api/planning'),u);assert.equal(data.entities.length,1);assert.equal(data.entities[0].access,1);assert.equal(data.manage,false);}finally{globalThis.fetch=realFetch;}
});
