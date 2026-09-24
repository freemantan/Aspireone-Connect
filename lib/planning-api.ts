import {supabase,rpc} from './supabase';
import {load} from './supabase-store';
import {check,find,Row} from './model';
import {Entity,Rules,entityAccess,manager,validateRules,validateBudget,calculate,annual} from './planning';
async function rows(table:string,filter=''){return (await supabase('/rest/v1/'+table+'?select=*'+filter)).json() as Promise<any[]>;}
export async function planningAPI(r:Request,user:Row){
 const {state}=await load(),u=find(state,'users',user.id);check(u.active&&!u.onboarding&&!u.deleted);
 const entities=await rows('ao_plan_entities'),visible=entities.filter(e=>entityAccess(state,u,e)>0),manage=manager(state,u);
 check(manage||visible.length>0,'Business Planning access has not been granted',403);
 if(r.method==='GET'){
 const rules=await rows('ao_plan_rules',manage?'':'&status=eq.published');
 const budgets=visible.length?await rows('ao_plan_budgets','&entity_id=in.('+visible.map(e=>e.id).join(',')+')'):[];
 return {entities:visible.map(e=>({...e,access:entityAccess(state,u,e)})),rules,budgets,manage};
 }
 check(r.method==='POST','Method not allowed',405);check(Number(r.headers.get('content-length')||0)<=500000,'Planning request too large',413);
 const raw=await r.text();check(new TextEncoder().encode(raw).length<=500000,'Planning request too large',413);const p=JSON.parse(raw);check(['entity','rules','budget'].includes(p.kind),'Invalid planning record',400);
 const d=p.data;check(d&&typeof d==='object'&&typeof d.name==='string'&&d.name.trim().length>0&&d.name.length<=200,'Enter a name up to 200 characters',400);
 check(!p.id||typeof p.id==='string'&&/^[a-f0-9-]{36}$/.test(p.id),'Invalid record ID',400);check(!p.id||Number.isInteger(p.revision)&&p.revision>0,'Invalid revision',400);
 let data:any;
 if(p.kind==='entity'){
 check(manage);check(['branch','online','coaching','company'].includes(d.kind),'Invalid entity type',400);
 check(!d.parent_id||entities.some(e=>e.id===d.parent_id),'Parent entity unavailable',400);check(!d.board_id||state.boards.some(b=>b.id===d.board_id&&!b.archived),'Access board unavailable',400);
 data={name:d.name.trim(),kind:d.kind,parent_id:d.parent_id||null,board_id:d.board_id||null};
 }else{
 check(['draft','published'].includes(d.status),'Invalid version status',400);
 if(p.kind==='rules'){check(manage);validateRules(d.payload);check(/^\d{4}-\d{2}-\d{2}$/.test(d.effective_date)&&!Number.isNaN(Date.parse(d.effective_date)),'Invalid effective date',400);data={name:d.name.trim(),effective_date:d.effective_date,status:d.status,payload:d.payload};}
 else{
 const entity=entities.find(e=>e.id===d.entity_id);check(entity&&entityAccess(state,u,entity)>=2,'Budget edit access required',403);if(d.status==='published')check(entityAccess(state,u,entity)>=3,'Manage access required to publish',403);
 if(p.id){const old=await rows('ao_plan_budgets','&id=eq.'+p.id);check(old.length&&old[0].entity_id===entity.id,'Budget unavailable',404);}
 check(Number.isInteger(d.year)&&d.year>=2000&&d.year<=2200,'Invalid budget year',400);
 check(typeof d.rule_id==='string'&&/^[a-f0-9-]{36}$/.test(d.rule_id),'Choose a published price and commission version',400);const rules=await rows('ao_plan_rules','&id=eq.'+d.rule_id+'&status=eq.published');check(rules.length,'Choose a published price and commission version',400);
 validateBudget(d.payload,rules[0].payload);if(d.status==='published')check(annual(calculate(d.payload,rules[0].payload).net)!==null,'Complete unknown values before publishing the budget',400);
 data={name:d.name.trim(),entity_id:entity.id,rule_id:d.rule_id,year:d.year,status:d.status,payload:d.payload};
 }
 }
 try{return await rpc('ao_plan_save',{p_kind:p.kind,p_id:p.id||null,p_revision:p.revision||0,p_actor:u.id,p_data:data});}
 catch(e){ // Check conflict separately without exposing database details.
 if(p.id){const table={entity:'ao_plan_entities',rules:'ao_plan_rules',budget:'ao_plan_budgets'}[p.kind as 'entity'];const current=await rows(table,'&id=eq.'+p.id);check(current.length&&current[0].revision===p.revision,'Another user changed this record. Your draft is preserved; reload before retrying.',409);check(current[0].status!=='published','Published versions cannot be edited. Create a new version.',409);}
 throw e;
 }
}
