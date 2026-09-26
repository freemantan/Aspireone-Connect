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

// Business Planning shares Connect authentication but has explicit planning roles.
test('every nonadministrator is denied persistence, including directors and senior managers',async()=>{
 const {planningAPI}=await import('../lib/planning-api');
 for(const roles of [[],['Director'],['Senior Manager']]){const state=initial();ensureKnowledge(state);const u={id:'planner',active:true,roles};state.users.push(u);let writes=0;globalThis.fetch=async(url)=>{if(String(url).endsWith('ao_load'))return Response.json({state,revision:1});if(String(url).endsWith('ao_commit'))return Response.json(true);writes++;throw Error('Unexpected request');};try{for(const kind of ['prices','commissions','budget'])await assert.rejects(planningAPI(new Request('https://portal.example/api/planning',{method:'POST',body:JSON.stringify({kind,data:{status:'published'}})}),u),/Only administrators/);assert.equal(writes,0);}finally{globalThis.fetch=realFetch;}}
});
test('readers and analysts see only publication snapshots, never draft values or names',async()=>{
 const {planningAPI,settingsId}=await import('../lib/planning-api');const {seedRules}=await import('../lib/planning-seed');
 for(const roles of [[],['Director'],['Senior Manager']]){const state=initial();ensureKnowledge(state);const u={id:'reader',active:true,roles};state.users.push(u);
 const row=(payload:any)=>({id:settingsId,name:'SECRET DRAFT',payload:{secret:true},revision:9,published_at:'2026-09-25',published_data:{name:'Public',effective_date:'2027-01-01',payload}});
 globalThis.fetch=async(url)=>{const path=new URL(String(url)).pathname;if(path.endsWith('ao_load'))return Response.json({state,revision:1});if(path.endsWith('ao_commit'))return Response.json(true);if(path.endsWith('ao_plan_entities'))return Response.json([{id:'c0000000-0000-4000-8000-000000000001'},{id:'c0000000-0000-4000-8000-000000000002'},{id:'excluded'}]);if(path.endsWith('ao_plan_prices'))return Response.json([row({prices:seedRules.prices})]);if(path.endsWith('ao_plan_commissions'))return Response.json([row({teacher:seedRules.teacher,rates:seedRules.rates})]);if(path.endsWith('ao_plan_budgets'))return Response.json([row({lines:[]}),{id:'unpublished',payload:{secret:true}}]);throw Error('Unexpected request');};
 try{const data=await planningAPI(new Request('https://portal.example/api/planning'),u);assert.equal(data.entities.length,2);assert.equal(data.manage,false);assert.equal(data.canAnalyze,roles.length>0);assert.equal(data.budgets.length,1);assert.ok(!JSON.stringify(data).includes('SECRET'));assert.ok(!JSON.stringify(data).includes('secret'));assert.equal(data.prices.revision,undefined);}finally{globalThis.fetch=realFetch;}}
});
test('administrator saves separate prices and cannot forge catalogue labels or publication snapshots',async()=>{
 const {planningAPI,settingsId}=await import('../lib/planning-api');const {seedRules}=await import('../lib/planning-seed');const state=initial();ensureKnowledge(state);const u={id:'admin-test',active:true,admin:true};state.users.push(u);let saved:any;
 globalThis.fetch=async(url,opts)=>{const path=new URL(String(url)).pathname;if(path.endsWith('ao_load'))return Response.json({state,revision:1});if(path.endsWith('ao_commit'))return Response.json(true);if(path.endsWith('ao_plan_entities'))return Response.json([]);if(path.endsWith('ao_plan_prices')||path.endsWith('ao_plan_commissions'))return Response.json([{id:settingsId,revision:1}]);if(path.endsWith('ao_planning_save')){saved=JSON.parse(String(opts?.body));return Response.json({...saved.p_data,id:settingsId,revision:2});}throw Error('Unexpected request');};
 const prices=structuredClone(seedRules.prices);prices[0].amount=9999;prices[0].level='Forged';
 try{await planningAPI(new Request('https://portal.example/api/planning',{method:'POST',body:JSON.stringify({kind:'prices',id:settingsId,revision:1,data:{name:'Prices',effective_date:'2027-01-01',status:'draft',payload:{prices},published_data:{secret:true}}})}),u);assert.equal(saved.p_kind,'prices');assert.equal(saved.p_actor,u.id);assert.equal(saved.p_data.payload.prices[0].amount,9999);assert.equal(saved.p_data.payload.prices[0].level,'Primary 1–2');assert.equal(saved.p_data.published_data,undefined);}finally{globalThis.fetch=realFetch;}
});
test('budget saves retain cashflow inputs and derive cached amounts from validated assumptions',async()=>{
 const {planningAPI,settingsId}=await import('../lib/planning-api');const {seedRules}=await import('../lib/planning-seed');const {budgetTemplate}=await import('../lib/planning');
 const state=initial();ensureKnowledge(state);const u={id:'budget-admin',active:true,admin:true};state.users.push(u);let saved:any,writes=0;
 const entity='c0000000-0000-4000-8000-000000000002';
 globalThis.fetch=async(url,opts)=>{const path=new URL(String(url)).pathname;
  if(path.endsWith('ao_load'))return Response.json({state,revision:1});if(path.endsWith('ao_commit'))return Response.json(true);
  if(path.endsWith('ao_plan_entities'))return Response.json([{id:entity,kind:'online'}]);
  if(path.endsWith('ao_plan_prices'))return Response.json([{id:settingsId,published_data:{payload:{prices:seedRules.prices}}}]);
  if(path.endsWith('ao_plan_commissions'))return Response.json([{id:settingsId,published_data:{payload:{teacher:seedRules.teacher,rates:seedRules.rates}}}]);
  if(path.endsWith('ao_planning_save')){writes++;saved=JSON.parse(String(opts?.body)).p_data;return Response.json(saved);}
  throw Error('Unexpected request');
 };
 const b=budgetTemplate(true);b.lines.find(l=>l.id==='cc')!.rate=99;b.cashflow={annualTarget:0,openingCash:5000000,payments:Array(12).fill(null)};b.cashflow.payments[0]=0;
 const request=()=>new Request('https://portal.example/api/planning',{method:'POST',body:JSON.stringify({kind:'budget',data:{entity_id:entity,year:2027,name:'Budget',status:'published',payload:b}})});
 try{await planningAPI(request(),u);assert.equal(saved.payload.lines.find((l:any)=>l.id==='cc').rate,4.5);assert.deepEqual(saved.payload.cashflow,b.cashflow);assert.equal(writes,1);
 b.lines.find(l=>l.id==='cc')!.driver={kind:'referral',referred:30,commission:200};await assert.rejects(planningAPI(request(),u),/assumptions/);assert.equal(writes,1);
 }finally{globalThis.fetch=realFetch;}
});
