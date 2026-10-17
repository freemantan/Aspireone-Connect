import {settings} from './supabase';
import {AppError,check,type Row} from './model';

async function scheduleRPC(name:string,args:Record<string,unknown>){
 const e=settings(),key=e.SUPABASE_SECRET_KEY;
 check(e.SUPABASE_URL&&key,'Schedule editing is not available yet.',503);
 const headers:Record<string,string>={apikey:key,'Content-Type':'application/json'};
 if(key.startsWith('eyJ'))headers.Authorization='Bearer '+key;
 const response=await fetch(e.SUPABASE_URL+'/rest/v1/rpc/'+name,{method:'POST',headers,body:JSON.stringify(args)});
 const result:any=await response.json();
 if(!response.ok){
  const code=String(result?.message||'');
  if(code.includes('SCHEDULE_FORBIDDEN'))throw new AppError('You do not have permission to make this change.',403);
  if(code.includes('SCHEDULE_CONFLICT'))throw new AppError('Another member changed this record. Reload it before saving. Your form has been kept.',409);
  if(code.includes('SCHEDULE_NOT_FOUND'))throw new AppError('This class is no longer available.',404);
  if(code.includes('SCHEDULE_INVALID')||['22007','22008','22P02'].includes(result?.code))throw new AppError('Check the branch, subject, levels, day, times and dates.',400);
  throw new AppError('Schedule editing is currently unavailable. Please try again later.',503);
 }
 return result;
}
export async function schedulingAPI(request:Request,user:Row){
 if(request.method==='GET')return scheduleRPC('ao_schedule_catalogue',{p_actor:user.id});
 check(request.method==='POST','Method not allowed',405);
 check(Number(request.headers.get('content-length')||0)<=40000,'Schedule request is too large.',413);
 const raw=await request.text();check(new TextEncoder().encode(raw).length<=40000,'Schedule request is too large.',413);
 let p:any;try{p=JSON.parse(raw);}catch{throw new AppError('Invalid schedule request.',400);}
 check(p&&typeof p==='object'&&!Array.isArray(p),'Invalid schedule request.',400);
 check(Number.isInteger(p.revision)&&p.revision>=0,'Reload the record before saving.',400);
 if(p.op==='delete'||p.op==='restore'){
  check(typeof p.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(p.id),'Invalid class.',400);
  return scheduleRPC('ao_schedule_set_deleted',{p_actor:user.id,p_id:p.id,p_revision:p.revision,p_deleted:p.op==='delete'});
 }
 if(p.op==='save'){
  check(p.id==null||typeof p.id==='string'&&/^[a-zA-Z0-9-]{1,80}$/.test(p.id),'Invalid class.',400);
  check(p.data&&typeof p.data==='object'&&!Array.isArray(p.data),'Invalid class.',400);
  for(const field of ['academic_year','term','day','start_minute','end_minute'])check(Number.isInteger(p.data[field]),'Enter valid class times and term.',400);
  return scheduleRPC('ao_schedule_save',{p_actor:user.id,p_id:p.id||null,p_revision:p.revision,p_data:p.data});
 }
 if(p.op==='global-member'){
  check(['user','role'].includes(p.type)&&typeof p.principal==='string'&&p.principal.length>0&&p.principal.length<=100&&['None','View','Edit','Manage'].includes(p.role),'Invalid all-branch membership.',400);
  return scheduleRPC('ao_schedule_global_member_save',{p_actor:user.id,p_type:p.type,p_principal:p.principal,p_role:p.role,p_revision:p.revision});
 }
 check(p.op==='member'&&typeof p.user==='string'&&p.user.length<=100&&typeof p.branch==='string'&&p.branch.length<=30,'Invalid membership.',400);
 check(p.role===null||['View','Edit','Manage'].includes(p.role),'Invalid access level.',400);
 return scheduleRPC('ao_schedule_member_save',{p_actor:user.id,p_user:p.user,p_branch:p.branch,p_role:p.role,p_revision:p.revision});
}
