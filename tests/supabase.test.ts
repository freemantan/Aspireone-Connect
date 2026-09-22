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
