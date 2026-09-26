import type {Budget,Line} from './planning';
export type BudgetDriver=
 | {kind:'referral';referred:number|null;commission:number|null}
 | {kind:'ah-access';accounts:number|null;fee:number|null;multiplier:number|null}
 | {kind:'employer-cpf';base:number|null;cpf:number|null};
const valid=(n:unknown,max:number,cents=false)=>n===null||typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=max&&(!cents||Number.isInteger(n));
export function validDriver(l:Line){
 const d=l.driver;if(d===undefined)return true;if(!d||typeof d!=='object')return false;
 if(d.kind==='referral')return l.method==='percent'&&(l.rateSource||'custom')==='custom'&&valid(d.referred,100)&&valid(d.commission,100);
 if(d.kind==='ah-access')return l.method==='manual'&&valid(d.accounts,1e7)&&valid(d.fee,1e9,true)&&valid(d.multiplier,1000)&&((d.accounts??0)*(d.fee??0)*(d.multiplier??0)<=1e12);
 if(d.kind==='employer-cpf')return l.method==='manual'&&valid(d.base,1e10,true)&&valid(d.cpf,100);
 return false;
}
export function deriveLine(line:Line):Line {
 const d=line.driver;if(!d)return line;
 if(d.kind==='referral')return {...line,rate:d.referred===null||d.commission===null?null:d.referred*d.commission/100};
 let monthly:number|null=null;
 if(d.kind==='ah-access'&&d.accounts!==null&&d.fee!==null&&d.multiplier!==null){
  const total=Math.round(d.accounts*d.fee*d.multiplier);
  // Allocate cents so twelve months reconcile exactly to the annual amount.
  return {...line,values:Array.from({length:12},(_,i)=>Math.floor(total/12)+(i<total%12?1:0))};
 }
 if(d.kind==='employer-cpf'&&d.base!==null&&d.cpf!==null)monthly=d.base+Math.round(d.base*d.cpf/100);
 return {...line,values:Array(12).fill(monthly)};
}
export function materializeBudget(b:Budget):Budget{return {...b,lines:b.lines.map(deriveLine)};}
// Only restore documented v4 breakdowns when every stored amount still matches.
export function withKnownDrivers(b:Budget):Budget {
 const lines=b.lines.map((l):Line=>{
  const names:Record<string,string>={director:'Management Support Cost',tech:'Technical Support',hosting:'Hosting and Subscriptions',staff:'Staff Cost (Manager + Admin)',marketing:'Marketing',launch:'Launch Marketing and Coach Subsidy'};
  if(names[l.id])l={...l,name:names[l.id]};
  if(l.id==='director'){l=deriveLine(l);const {driver,...manual}=l;return manual;}
  if(l.driver)return l;
  if(l.method==='percent'&&(l.rateSource||'custom')==='custom'){
   if(l.id==='cc'&&l.baseId==='c'&&l.rate===4.5)return {...l,driver:{kind:'referral',referred:30,commission:15}};
   if(l.id==='dc'&&l.baseId==='d'&&l.rate===12)return {...l,driver:{kind:'referral',referred:30,commission:40}};
  }
  if(l.method==='manual'&&l.id==='ah'&&l.values.every(v=>v===849900))return {...l,driver:{kind:'ah-access',accounts:2833,fee:1200,multiplier:3}};
  return l;
 });
 const costs=lines.filter(l=>l.category==='operating_cost').sort((a,b)=>{
  const order=['director','tech','hosting','staff','marketing','launch'];
  return (order.includes(a.id)?order.indexOf(a.id):order.length)-(order.includes(b.id)?order.indexOf(b.id):order.length);
 });
 let index=0;return materializeBudget({...b,lines:lines.map(l=>l.category==='operating_cost'?costs[index++]:l)});
}
