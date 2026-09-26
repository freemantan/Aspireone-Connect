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
 if(data.entities.some((e:any)=>e.id===next.entity_id&&e.kind==='online'))next.payload=withKnownDrivers(combineStaff(next.payload));
 return next;
}
