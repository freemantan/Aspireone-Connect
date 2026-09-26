import {onlineCashflow} from './budget-cashflow';
import {annual, Budget, calculate, clone, Line, Rules} from './planning';

// A presentation migration only: retain every month's total, unknowns and formula dependencies.
export function combineStaff(b:Budget):Budget {
 const next=clone(b),admin=next.lines.find(l=>l.id==='admin'),manager=next.lines.find(l=>l.id==='manager');
 if(!admin||!manager||next.lines.some(l=>l.id==='staff'||l.baseId==='admin'||l.baseId==='manager')||[admin,manager].some(l=>l.method!=='manual'||l.category!=='operating_cost'))return next;
 const staff:Line={...admin,id:'staff',name:'Staff Cost',values:admin.values.map((v,i)=>v===null||manager.values[i]===null?null:v+manager.values[i]!)};
 next.lines=next.lines.flatMap(l=>l.id==='admin'?[staff]:l.id==='manager'?[]:[l]);return next;
}
export function onlineSales(b:Budget,r:Rules){
 const result=calculate(b,r),c=annual(result.rows.c||[null]),d=annual(result.rows.d||[null]);
 const external=c===null||d===null?null:c+d;
 return {result,external,share:external&&c!==null?c/external:0.6};
}
// Full-year external revenue is spread using a linear January-to-December profile.
export function withOnlineSales(b:Budget,external:number,share:number,start=1):Budget {
 const next=clone(b),weight=(1+start)/2;
 for(const [id,part] of [['c',share],['d',1-share]] as const){const line=next.lines.find(l=>l.id===id);if(!line||line.method!=='manual'||line.category!=='revenue')throw Error('The guided model needs monthly Product C and D revenue lines. Use the detailed P&L editor for this scenario.');line.values=Array.from({length:12},(_,i)=>Math.round(external*part/12*(start+i*(1-start)/11)/weight));}
 return next;
}
export function salesProfile(b:Budget){
 const c=b.lines.find(l=>l.id==='c'),d=b.lines.find(l=>l.id==='d');
 if(!c||!d||[c,d].some(l=>l.method!=='manual'||l.category!=='revenue'||l.values.some(v=>v===null)))return null;
 const values=c.values.map((v,i)=>v!+d.values[i]!),end=values[11],start=end?values[0]/end:1;
 const linear=values.every((v,i)=>Math.abs(v-(values[0]+i*(end-values[0])/11))<=3);
 return {start,linear,runRate:end*12};
}
export function breakeven(b:Budget,r:Rules,share:number){
 // Solve against the same P&L engine used for saved budgets; preserve additional lines and costs.
 const net=(sales:number)=>annual(calculate(withOnlineSales(b,sales,share),r).net);
 const zero=net(0);if(zero===null)return null;
 if(zero>=0)return {external:0,result:calculate(withOnlineSales(b,0,share),r),covered:true};
 const probe=net(100000000);if(probe===null||probe<=zero)return null;
 let low=0,high=Math.ceil(-zero/(probe-zero)*100000000)+10000;
 if(high>1e12)return null;
 while((net(high)??-1)<0){high*=2;if(high>1e12)return null;}
 for(let i=0;i<45&&high-low>1;i++){const mid=Math.floor((low+high)/2);if((net(mid)??-1)>=0)high=mid;else low=mid;}
 const result=calculate(withOnlineSales(b,Math.ceil(high),share),r);
 return {external:annual(result.rows.c)!+annual(result.rows.d)!,result,covered:false};
}
export function cumulative(values:(number|null)[]){let sum:number|null=0;return values.map(v=>sum=sum===null||v===null?null:sum+v);}

// Solve the displayed 16-month cashflow, excluding opening cash from breakeven.
export function cashflowBreakeven(b:Budget,r:Rules,share:number){
 const scenario=(sales:number)=>{const n=withOnlineSales(b,sales,share,1);if(n.cashflow)n.cashflow.annualTarget=null;return n;};
 const net=(sales:number)=>annual(onlineCashflow(scenario(sales),r).net);
 const zero=net(0);if(zero===null)return null;
 if(zero>=0)return {external:0,budget:scenario(0),result:calculate(scenario(0),r),covered:true};
 const probe=net(100000000);if(probe===null||probe<=zero)return null;
 let low=0,high=Math.ceil(-zero/(probe-zero)*100000000)+10000;
 while(high<=1e12&&(net(high)??-1)<0)high*=2;
 if(high>1e12)return null;
 while(high-low>1){const mid=Math.floor((low+high)/2);if((net(mid)??-1)>=0)high=mid;else low=mid;}
 const budget=scenario(high),result=calculate(budget,r);
 return {external:annual(result.rows.c)!+annual(result.rows.d)!,budget,result,covered:false};
}
