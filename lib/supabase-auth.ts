import {runtime,load,transact,bootstrap} from './supabase-store';
import {check,uid,now,Row} from './model';
import {rpc,supabase} from './supabase';
export const hash=async(s:string)=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(s)))).map(x=>x.toString(16).padStart(2,'0')).join('');
export const cookie=(r:Request,name:string)=>r.headers.get('cookie')?.split(';').map(x=>x.trim()).find(x=>x.startsWith(name+'='))?.slice(name.length+1)||'';
export const isDemo=(_r:Request)=>false;
export const setCookie=(r:Request,name:string,value:string,age=43200)=>`${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${age}${new URL(r.url).protocol==='https:'?'; Secure':''}`;
export async function identity(r:Request){const token=cookie(r,'ao_session');check(token,'Sign in to continue',401);const saved=await rpc('ao_session_get',{token_hash:await hash(token)});check(saved,'Session expired. Sign in again.',401);const {state}=await load();const user=state.users.find(u=>u.id===saved);check(user&&user.active,'Access unavailable',403);return user;}
export async function session(r:Request,user:Row){const token=uid()+uid();await rpc('ao_session_put',{token_hash:await hash(token),user_id:user.id});return setCookie(r,'ao_session',token);}
export async function logout(r:Request){await rpc('ao_session_delete',{token_hash:await hash(cookie(r,'ao_session'))});return new Response('{}',{headers:{'Set-Cookie':setCookie(r,'ao_session','',0)}});}
export async function login(r:Request){
 const e=runtime();check(e.SUPABASE_URL&&e.SUPABASE_PUBLISHABLE_KEY,'Supabase sign-in needs configuration',503);
 const token=uid()+uid(),verifier=(uid()+uid()).replace(/-/g,'');
 const challenge=btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(verifier))))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
 const invite=new URL(r.url).searchParams.get('invite')||'';
 await rpc('ao_oauth_put',{token_hash:await hash(token),data:{verifier,invite}});
 const url=new URL(e.SUPABASE_URL+'/auth/v1/authorize');
 url.search=new URLSearchParams({provider:'google',redirect_to:new URL('/api/auth/callback',r.url).href,code_challenge:challenge,code_challenge_method:'s256',scopes:'email profile',prompt:'select_account'}).toString();
 return new Response(null,{status:302,headers:{Location:url.href,'Set-Cookie':setCookie(r,'ao_oauth',token,600),'Cache-Control':'no-store'}});
}
export async function callback(r:Request){
 const token=cookie(r,'ao_oauth'),code=new URL(r.url).searchParams.get('code');check(token&&code,'Login expired or cancelled. Please sign in again.',400);
 const saved=await rpc('ao_oauth_take',{token_hash:await hash(token)});check(saved,'Login expired. Please sign in again.',400);
 const tokens=await(await supabase('/auth/v1/token?grant_type=pkce',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({auth_code:code,code_verifier:saved.verifier})},undefined,true)).json() as any;
 check(tokens.access_token,'Invalid sign-in response',401);
 const verified=await(await supabase('/auth/v1/user',{},tokens.access_token,true)).json() as any;
 check(verified.email_confirmed_at&&verified.identities?.some((i:any)=>i.provider==='google'),'A verified Google account is required',401);
 await bootstrap();const email=String(verified.email).toLowerCase();
 const user=await transact(s=>{
  let u=s.users.find(u=>u.email===email);const admins=String(runtime().ADMIN_EMAILS||'').split(',').map((x:string)=>x.trim().toLowerCase());
  const invited=s.invites.some(i=>i.email===email&&i.state==='pending'&&i.expires>now());
  check((u&&u.active&&!u.onboarding)||admins.includes(email)||invited,'Access unavailable. Ask a board manager for an invitation.',403);
  if(!u){const name=verified.user_metadata?.full_name||email;u={id:uid(),email,name,abbreviation:name.split(' ').map((x:string)=>x[0]).join('').slice(0,4),active:true,onboarding:!admins.includes(email),admin:admins.includes(email)};s.users.push(u);}
  check(u.active,'Account inactive',403);check(!u.googleSub||u.googleSub===verified.id,'Account identity mismatch',403);u.googleSub=verified.id;return u;
 });
 const headers=new Headers({Location:saved.invite?'/?invite='+encodeURIComponent(saved.invite):'/','Cache-Control':'no-store'});
 headers.append('Set-Cookie',await session(r,user));headers.append('Set-Cookie',setCookie(r,'ao_oauth','',0));return new Response(null,{status:302,headers});
}
