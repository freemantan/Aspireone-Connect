import {linkedOnlineCommissions} from './online-commissions';
import {clone} from './planning';
import {withKnownDrivers} from './budget-drivers';
import {combineStaff} from './online-budget';
export function visibleBudgets(data:any,published:boolean){
 if(!published||!data.manage)return data.budgets||[];
 return (data.budgets||[]).filter((b:any)=>b.published_data).map((b:any)=>({...b.published_data,id:b.id,status:'published'}));
}
export function selectedBudget(data:any,published:boolean,id?:string|null){
 const rows=visibleBudgets(data,published);
 return prepareBudget(data,rows.find((b:any)=>b.id===id)||rows[0]||null);
}
export function prepareBudget(data:any,record:any){
 if(!record)return null;
 const next=clone(record);
 if(data.entities.some((e:any)=>e.id===next.entity_id&&e.kind==='online')){next.payload=withKnownDrivers(combineStaff(next.payload));if(data.publishedRules)next.payload=linkedOnlineCommissions(next.payload,data.publishedRules);}
 return next;
}
export const planningTabs=['Prices','Commissions','Aspire Online Budget','Physical Centre'];
export const isBudgetTab=(tab:string)=>tab==='Aspire Online Budget'||tab==='Physical Centre';
export const planningRoute=(tab:string)=>({'Prices':'prices','Commissions':'commissions','Aspire Online Budget':'budgets','Physical Centre':'physical'} as Record<string,string>)[tab];
export const planningTab=(route:string|null)=>route==='commissions'?'Commissions':route==='budgets'?'Aspire Online Budget':route==='physical'?'Physical Centre':'Prices';
export function budgetScope(data:any,tab:string){
 const entities=data.entities.filter((e:any)=>tab==='Aspire Online Budget'?e.kind==='online':e.kind==='branch');
 return {...data,entities,budgets:(data.budgets||[]).filter((b:any)=>entities.some((e:any)=>e.id===b.entity_id))};
}
