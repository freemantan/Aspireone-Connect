import {canViewPlan,validateMemberAccess,validatePlanRoleAccess} from './planning-access';
import {calculatePriceTiers,proposalVersion} from './price-calculations';
import {linkedOnlineCommissions} from './online-commissions';
import {materializeBudget} from './budget-drivers';
import {supabase,rpc} from './supabase';
import {load} from './supabase-store';
import {check,find,Row} from './model';
import {analyst,manager,validateRules,validateBudget,calculate,annual,Rules} from './planning';
import {seedRules} from './planning-seed';
const tables={prices:'ao_plan_prices',commissions:'ao_plan_commissions',budget:'ao_plan_budgets'};
export const settingsId='c0000000-0000-4000-8000-000000000003';
async function rows(table:string,filter=''){return (await supabase('/rest/v1/'+table+'?select=*'+filter)).json() as Promise<any[]>;}
// Readers receive only the last published snapshot, never a working draft.
export function publishedRecord(row:any){return row?.published_data?{...row.published_data,id:row.id,status:'published',published_at:row.published_at,payload:{...row.published_data.payload,memberAccess:row.payload?.memberAccess??[],roleAccess:row.payload?.roleAccess||{}}}:null;}
export async function planningAPI(r:Request,user:Row){
 const {state}=await load(),u=find(state,'users',user.id);check(u.active&&!u.onboarding&&!u.deleted);
 const manage=manager(state,u),canAnalyze=analyst(u);
 if(r.method!=='GET'){check(r.method==='POST','Method not allowed',405);check(manage,'Only administrators can save drafts or publish',403);}
 const [allEntities,priceRows,commissionRows]=await Promise.all([rows('ao_plan_entities'),rows(tables.prices),rows(tables.commissions)]);
 const entities=allEntities.filter(e=>['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'].includes(e.id));
 const price=priceRows.find(x=>x.id===settingsId),commission=commissionRows.find(x=>x.id===settingsId);
 const priceAccess=canViewPlan(price,u),commissionAccess=canViewPlan(commission,u);
 const pubPrice=priceAccess?publishedRecord(price):null,pubCommission=commissionAccess?publishedRecord(commission):null;
 const publishedRules:Rules|null=pubPrice&&pubCommission?{prices:pubPrice.payload.prices,...pubCommission.payload}:null;
 if(r.method==='GET'){
  let budgets=await rows(tables.budget,'&entity_id=in.('+entities.map(e=>e.id).join(',')+')');
  if(!manage)budgets=budgets.filter(b=>priceAccess&&commissionAccess&&canViewPlan(b,u));
  if(publishedRules)budgets=budgets.map(b=>{
   if(!entities.some(e=>e.id===b.entity_id&&e.kind==='online'))return b;
   const sync=(record:any)=>record?{...record,payload:linkedOnlineCommissions(record.payload,publishedRules!)}:record;
   return {...sync(b),published_data:sync(b.published_data)};
  });
  return {access:{prices:priceAccess,commissions:commissionAccess},entities:entities.map(e=>({...e,access:manage?3:canAnalyze?2:1})),prices:manage?price:pubPrice,commissions:manage?commission:pubCommission,publishedPrices:pubPrice,publishedCommissions:pubCommission,publishedRules,budgets:manage?budgets:budgets.map(publishedRecord).filter(Boolean),manage,canAnalyze};
 }
 check(Number(r.headers.get('content-length')||0)<=500000,'Planning request too large',413);
 const raw=await r.text();check(new TextEncoder().encode(raw).length<=500000,'Planning request too large',413);
 const p=JSON.parse(raw);check(Object.hasOwn(tables,p.kind),'Invalid planning record',400);
 const kind=p.kind as keyof typeof tables,d=p.data;
 if(p.action==='members'){
  check(typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id)&&Number.isInteger(p.revision)&&p.revision>0,'Invalid plan revision',400);
  const old=(await rows(tables[kind],'&id=eq.'+p.id))[0];check(old,'Plan unavailable',404);
  check(old.revision===p.revision,'Another administrator changed this plan. Reload and try again.',409);
  let memberAccess;try{memberAccess=validateMemberAccess(p.members,state.users);}catch{check(false,'Choose active members for plan access',400);}
  let roleAccess;try{roleAccess=validatePlanRoleAccess(p.roleAccess===undefined?old.payload?.roleAccess:p.roleAccess);}catch{check(false,'Choose valid plan role access',400);}
  const fields=kind==='budget'?{entity_id:old.entity_id,year:old.year,rules_snapshot:old.rules_snapshot}:{effective_date:old.effective_date};
  try{return await rpc('ao_planning_save',{p_kind:kind,p_id:p.id,p_revision:p.revision,p_actor:u.id,p_data:{...fields,name:old.name,status:old.status,payload:{...old.payload,memberAccess,roleAccess}}});}
  catch(e){const current=(await rows(tables[kind],'&id=eq.'+p.id))[0];check(current?.revision===p.revision,'Another administrator changed this plan. Reload and try again.',409);throw e;}
 }

 check(d&&typeof d==='object'&&typeof d.name==='string'&&d.name.trim().length>0&&d.name.length<=200,'Enter a name up to 200 characters',400);
 check(!p.id||typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id),'Invalid record ID',400);
 check(!p.id||Number.isInteger(p.revision)&&p.revision>0,'Invalid revision',400);
 check(['draft','published'].includes(d.status),'Invalid status',400);
 let memberAccess;try{memberAccess=validateMemberAccess(d.payload?.memberAccess,state.users);}catch{check(false,'Choose active members for plan access',400);}
 let roleAccess;try{roleAccess=validatePlanRoleAccess(d.payload?.roleAccess);}catch{check(false,'Choose valid plan role access',400);}
 let data:any={name:d.name.trim(),status:d.status,payload:d.payload};
 if(kind!=='budget'){
  check(p.id===settingsId,'Use the current settings record',400);
  check(typeof d.effective_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.effective_date)&&!Number.isNaN(Date.parse(d.effective_date))&&new Date(d.effective_date).toISOString().slice(0,10)===d.effective_date,'Invalid effective date',400);
  data.effective_date=d.effective_date;
  if(kind==='prices'){
   validateRules({...seedRules,prices:d.payload?.prices});
   check(d.payload.prices.length===seedRules.prices.length&&seedRules.prices.every(source=>d.payload.prices.some((v:any)=>v.id===source.id)),'Keep the complete price catalogue',400);
   const prices=seedRules.prices.map(source=>{const input=d.payload.prices.find((v:any)=>v.id===source.id);const {discount:_,...metadata}=source;return {...metadata,amount:source.unavailable?null:input.amount,...(input.discount!==undefined?{discount:input.discount}:{})};});
   for(const price of prices)check(price.discount===undefined||price.discount===null||Number.isInteger(price.discount)&&price.discount>=0&&price.discount<=1e12,'Invalid dollar discount',400);
   const calculated=calculatePriceTiers(prices);validateRules({...seedRules,prices:calculated});
   data.payload={prices:calculated,...(d.payload.proposalVersion===proposalVersion?{proposalVersion}:{})};
  }else{validateRules({...d.payload,prices:[]});data.payload={teacher:d.payload.teacher,rates:d.payload.rates,...(d.payload.teacherMinimum!==undefined?{teacherMinimum:d.payload.teacherMinimum,teacherDefaultsVersion:d.payload.teacherDefaultsVersion}:{})};}
 }else{
  check(entities.some(e=>e.id===d.entity_id),'Business entity unavailable',400);
  check(Number.isInteger(d.year)&&d.year>=2000&&d.year<=2200,'Invalid budget year',400);
  let rules=publishedRules;
  if(p.id){const old=(await rows(tables.budget,'&id=eq.'+p.id))[0];check(old&&old.entity_id===d.entity_id,'Budget unavailable',404);rules=old.rules_snapshot||publishedRules;}
  check(rules,'Publish prices and commissions before saving a budget',400);
  validateBudget(d.payload,rules!);
  if(entities.some(e=>e.id===d.entity_id&&e.kind==='online')&&publishedRules)d.payload=linkedOnlineCommissions(d.payload,publishedRules);
  validateBudget(d.payload,rules!);
  data.payload=materializeBudget(d.payload);
  if(d.status==='published')check(annual(calculate(d.payload,rules!).net)!==null,'Complete unknown values before publishing the budget',400);
  data={...data,entity_id:d.entity_id,year:d.year,rules_snapshot:rules};
 }
 data.payload={...data.payload,memberAccess,roleAccess};
 try{return await rpc('ao_planning_save',{p_kind:kind,p_id:p.id||null,p_revision:p.revision||0,p_actor:u.id,p_data:data});}
 catch(e){if(p.id){const current=(await rows(tables[kind],'&id=eq.'+p.id))[0];check(current&&current.revision===p.revision,'Another administrator saved changes. Your edits are preserved; reload the saved values before retrying.',409);}throw e;}
}
