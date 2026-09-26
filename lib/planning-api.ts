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
export function publishedRecord(row:any){return row?.published_data?{...row.published_data,id:row.id,status:'published',published_at:row.published_at}:null;}
export async function planningAPI(r:Request,user:Row){
 const {state}=await load(),u=find(state,'users',user.id);check(u.active&&!u.onboarding&&!u.deleted);
 const manage=manager(state,u),canAnalyze=analyst(u);
 if(r.method!=='GET'){check(r.method==='POST','Method not allowed',405);check(manage,'Only administrators can save drafts or publish',403);}
 const [allEntities,priceRows,commissionRows]=await Promise.all([rows('ao_plan_entities'),rows(tables.prices),rows(tables.commissions)]);
 const entities=allEntities.filter(e=>['c0000000-0000-4000-8000-000000000001','c0000000-0000-4000-8000-000000000002'].includes(e.id));
 const price=priceRows.find(x=>x.id===settingsId),commission=commissionRows.find(x=>x.id===settingsId);
 const pubPrice=publishedRecord(price),pubCommission=publishedRecord(commission);
 const publishedRules:Rules|null=pubPrice&&pubCommission?{prices:pubPrice.payload.prices,...pubCommission.payload}:null;
 if(r.method==='GET'){
  const budgets=await rows(tables.budget,'&entity_id=in.('+entities.map(e=>e.id).join(',')+')');
  return {entities:entities.map(e=>({...e,access:manage?3:canAnalyze?2:1})),prices:manage?price:pubPrice,commissions:manage?commission:pubCommission,publishedPrices:pubPrice,publishedCommissions:pubCommission,publishedRules,budgets:manage?budgets:budgets.map(publishedRecord).filter(Boolean),manage,canAnalyze};
 }
 check(Number(r.headers.get('content-length')||0)<=500000,'Planning request too large',413);
 const raw=await r.text();check(new TextEncoder().encode(raw).length<=500000,'Planning request too large',413);
 const p=JSON.parse(raw);check(Object.hasOwn(tables,p.kind),'Invalid planning record',400);
 const kind=p.kind as keyof typeof tables,d=p.data;
 check(d&&typeof d==='object'&&typeof d.name==='string'&&d.name.trim().length>0&&d.name.length<=200,'Enter a name up to 200 characters',400);
 check(!p.id||typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id),'Invalid record ID',400);
 check(!p.id||Number.isInteger(p.revision)&&p.revision>0,'Invalid revision',400);
 check(['draft','published'].includes(d.status),'Invalid status',400);
 let data:any={name:d.name.trim(),status:d.status,payload:d.payload};
 if(kind!=='budget'){
  check(p.id===settingsId,'Use the current settings record',400);
  check(typeof d.effective_date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(d.effective_date)&&!Number.isNaN(Date.parse(d.effective_date))&&new Date(d.effective_date).toISOString().slice(0,10)===d.effective_date,'Invalid effective date',400);
  data.effective_date=d.effective_date;
  if(kind==='prices'){
   validateRules({...seedRules,prices:d.payload?.prices});
   check(d.payload.prices.length===seedRules.prices.length&&seedRules.prices.every(source=>d.payload.prices.some((v:any)=>v.id===source.id)),'Keep the complete price catalogue',400);
   data.payload={prices:seedRules.prices.map(source=>({...source,amount:source.unavailable?null:d.payload.prices.find((v:any)=>v.id===source.id).amount}))};
  }else{validateRules({...d.payload,prices:[]});data.payload={teacher:d.payload.teacher,rates:d.payload.rates};}
 }else{
  check(entities.some(e=>e.id===d.entity_id),'Business entity unavailable',400);
  check(Number.isInteger(d.year)&&d.year>=2000&&d.year<=2200,'Invalid budget year',400);
  let rules=publishedRules;
  if(p.id){const old=(await rows(tables.budget,'&id=eq.'+p.id))[0];check(old&&old.entity_id===d.entity_id,'Budget unavailable',404);rules=old.rules_snapshot||publishedRules;}
  check(rules,'Publish prices and commissions before saving a budget',400);
  validateBudget(d.payload,rules!);
  data.payload=materializeBudget(d.payload);
  if(d.status==='published')check(annual(calculate(d.payload,rules!).net)!==null,'Complete unknown values before publishing the budget',400);
  data={...data,entity_id:d.entity_id,year:d.year,rules_snapshot:rules};
 }
 try{return await rpc('ao_planning_save',{p_kind:kind,p_id:p.id||null,p_revision:p.revision||0,p_actor:u.id,p_data:data});}
 catch(e){if(p.id){const current=(await rows(tables[kind],'&id=eq.'+p.id))[0];check(current&&current.revision===p.revision,'Another administrator saved changes. Your edits are preserved; reload the saved values before retrying.',409);}throw e;}
}
