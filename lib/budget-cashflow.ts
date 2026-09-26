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

export const onlinePeriods=Array.from({length:16},(_,i)=>({year:i<4?2026:2027,month:(i+8)%12}));
// The source provides seasonality, not a separate 2026 sales target. Apply the
// selected annual target to each year and retain only Sep–Dec for 2026.
export function onlineCashflow(b:Budget,r:Rules){
 const original=calculate(b,r),target=b.cashflow?.annualTarget??annual(original.revenue);
 const revenue=b.lines.filter(l=>l.category==='revenue'),baseTotals=revenue.map(l=>annual(original.rows[l.id]));
 const base=annual(baseTotals);
 let allocated=0;
 const seasonal={...b,lines:b.lines.map(l=>{
  if(l.category!=='revenue')return l;
  const index=revenue.indexOf(l),amount=baseTotals[index];
  let total=amount;
  if(b.cashflow?.annualTarget!==null&&b.cashflow?.annualTarget!==undefined){
   total=base===null?null:base===0?(index===0?target:0):index===revenue.length-1?target!-allocated:Math.round(target!*amount!/base);
   if(total!==null)allocated+=total;
  }
  return {...l,method:'manual' as const,driver:undefined,values:seasonalCollections(total)};
 })};
 const projected=calculate(seasonal,r);
 const rows=b.lines.map(l=>{
  let values=onlinePeriods.map(p=>projected.rows[l.id][p.month]);
  if(l.id==='ah'){
   // Monthly fees are collected the following month; collections begin in January 2027.
   const fee=original.rows[l.id];
   const override=b.cashflow?.annualTarget;
   const total=annual(projected.rows[l.id]),originalTotal=annual(fee);
   let scheduled=fee;
   if(override!==null&&override!==undefined){
    if(total===null||originalTotal===null)scheduled=Array(12).fill(null);
    else {const precise=fee.map(v=>originalTotal===0?total/12:v!*total/originalTotal),rounded=precise.map(Math.floor),order=precise.map((v,i)=>({i,f:v-rounded[i]})).sort((a,b)=>b.f-a.f||a.i-b.i);const remainder=total-rounded.reduce((a,b)=>a+b,0);for(let i=0;i<remainder;i++)rounded[order[i].i]++;scheduled=rounded;}
   }
   values=onlinePeriods.map((p,i)=>i<4?0:scheduled[(p.month+11)%12]);
  }
  if(l.id==='launch'){
   const total=annual(original.rows[l.id]);
   values=onlinePeriods.map((_,i)=>i>=1&&i<=4?(total===null?null:Math.floor(total/4)+(i-1<total%4?1:0)):0);
  }
  return {id:l.id,name:l.name,category:l.category,values};
 });
 const total=(categories:string[])=>onlinePeriods.map((_,i)=>rows.filter(l=>categories.includes(l.category)).reduce<number|null>((sum,l)=>add(sum,l.values[i]),0));
 const receipts=total(['revenue','other_income']),expense=total(['direct_cost','operating_cost','tax']);
 const overrides=b.cashflow?.periodPayments;
 const payments=expense.map((v,i)=>overrides?overrides[i]??v:i>=4?b.cashflow?.payments[i-4]??v:v);
 const adjustment=payments.map((v,i)=>v===null||expense[i]===null?null:v-expense[i]!);
 const net=receipts.map((v,i)=>v===null||payments[i]===null?null:v-payments[i]!);
 let balance=b.cashflow?.septemberOpening===undefined?3250000:b.cashflow.septemberOpening;
 const opening:(number|null)[]=[],closing:(number|null)[]=[];
 net.forEach(v=>{opening.push(balance);balance=add(balance,v);closing.push(balance);});
 return {target,rows,receipts,expense,payments,adjustment,net,opening,closing};
}
