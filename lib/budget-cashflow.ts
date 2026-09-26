import {annual,Budget,calculate,Rules} from './planning';
import source from './cashflow-source.json';
export {source as cashflowSource};
export function seasonalCollections(target:number|null):(number|null)[]{
 if(target===null)return Array(12).fill(null);
 const precise=source.shares.map(s=>s*target),values=precise.map(Math.floor);
 let remainder=target-values.reduce((a,b)=>a+b,0);
 const largest=precise.map((v,i)=>({i,fraction:v-values[i]})).sort((a,b)=>b.fraction-a.fraction||a.i-b.i);
 for(let i=0;i<remainder;i++)values[largest[i].i]++;
 return values;
}
const add=(a:number|null,b:number|null)=>a===null||b===null?null:a+b;
export function budgetCashflow(b:Budget,r:Rules){
 const p=calculate(b,r),target=b.cashflow?.annualTarget??annual(p.revenue),collections=seasonalCollections(target);
 const category=(names:string[])=>Array.from({length:12},(_,i)=>b.lines.filter(l=>names.includes(l.category)).reduce<number|null>((sum,l)=>add(sum,p.rows[l.id][i]),0));
 const other=category(['other_income']),expense=category(['direct_cost','operating_cost','tax']);
 const payments=expense.map((v,i)=>b.cashflow?.payments[i]??v),receipts=collections.map((v,i)=>add(v,other[i]));
 const net=receipts.map((v,i)=>v===null||payments[i]===null?null:v-payments[i]!);
 let current=b.cashflow?.openingCash??null,total:number|null=0;
 const opening:(number|null)[]=[],closing:(number|null)[]=[],cumulative:(number|null)[]=[];
 net.forEach(v=>{opening.push(current);current=add(current,v);closing.push(current);total=add(total,v);cumulative.push(total);});
 return {target,collections,other,receipts,expense,payments,net,opening,closing,cumulative};
}
