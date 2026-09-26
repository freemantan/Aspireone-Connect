import {test} from 'node:test';
import assert from 'node:assert/strict';
import {annual,budgetTemplate,calculate,clone,earnings,entityAccess,manager,validateBudget,validateRules} from '../lib/planning';
import {seedRules} from '../lib/planning-seed';
import {initial} from '../lib/model';
test('source prices and channel applicability are preserved',()=>{validateRules(seedRules);assert.equal(seedRules.prices.find(p=>p.id==='A-8-11')!.amount,7400);assert.deepEqual(seedRules.rates.initial['Cold Call'].A,[5,3,0,5]);assert.deepEqual(seedRules.rates.initial.Online.A,[null,null,null,null]);assert.equal(seedRules.rates.initial.Online.C,undefined);});
test('commission engine rounds recipient payments to dollars with explicit basis',()=>{const v=earnings(88320,40,[5,3,0,5],'gross');assert.equal(v.teacher,35328);assert.deepEqual(v.commissions,[4400,2600,0,4400]);assert.equal(v.retained,41592);assert.equal(earnings(10000,40,[5,3,0,5],'net').retained,5200);assert.equal(earnings(0,40,[0,0,0,0],'gross').percent,null);assert.equal(earnings(10000,40,[null,0,0,0],'gross').retained,null);assert.equal(earnings(10000,90,[15,10,15,0],'gross').retained,-3000);});
test('flexible lines resolve quantity, teacher, commission, and chained custom formulas',()=>{const b=budgetTemplate();b.lines[0].method='quantity';b.lines[0].priceId='A-8-11';b.lines[0].values=Array(12).fill(12);b.lines[1]={...b.lines[1],method:'percent',baseId:'sales',rateSource:'teacher',product:'A'};b.lines.push({id:'commission',name:'Commission',category:'direct_cost',method:'percent',values:Array(12).fill(0),rate:null,rateSource:'commission',product:'A',channel:'Cold Call',saleType:'initial',baseId:'sales'});const r=calculate(b,seedRules);assert.equal(r.revenue[0],88800);assert.equal(r.net[0],41780);assert.equal(annual(r.net),501360);});
test('unknowns propagate; zeros remain valid; circular and missing references rejected',()=>{const b=budgetTemplate();b.lines[0].values[0]=null;assert.equal(annual(calculate(b,seedRules).net),null);b.lines[0].values[0]=0;assert.equal(annual(calculate(b,seedRules).net),0);b.lines[0].method='percent';b.lines[0].baseId='teacher';b.lines[1].method='percent';b.lines[1].baseId='sales';assert.throws(()=>validateBudget(b,seedRules),/Circular/);b.lines[1].baseId='missing';assert.throws(()=>validateBudget(b,seedRules),/base line/);});
test('invalid amounts, duplicate IDs, and unsupported commission combinations are rejected',()=>{const r=clone(seedRules);r.prices[0].amount=-1;assert.throws(()=>validateRules(r));r.prices[0].amount=1.1;assert.throws(()=>validateRules(r));const b=budgetTemplate();b.lines[1].id=b.lines[0].id;assert.throws(()=>validateBudget(b,seedRules));const b2=budgetTemplate();Object.assign(b2.lines[1],{method:'percent',baseId:'sales',rateSource:'commission',product:'C',channel:'Online',saleType:'initial'});assert.throws(()=>validateBudget(b2,seedRules),/commission/);});
test('Aspire Online template has annual costs and ramp result from original model',()=>{const b=budgetTemplate(true),r=calculate(b,seedRules);assert.equal(annual(r.rows.ah),10198800);assert.equal(annual(r.rows.tech),7800000);assert.equal(r.rows.launch[0],3000000);assert.equal(r.rows.launch[1],0);assert.equal(annual(r.rows.director),1308000);assert.ok(Math.abs(annual(r.net)!-(-7690950))<10);});
test('only directors and senior managers analyze; only active admins persist',()=>{const s=initial(),u={id:'staff',active:true,roles:[]},e:any={id:'centre',board_id:'board-1'};s.members.push({id:'m',user:u.id,board:'board-1',role:'Manage'});assert.equal(entityAccess(s,u,e),1);assert.equal(entityAccess(s,{...u,roles:['Director']},e),2);assert.equal(entityAccess(s,{...u,roles:['Senior Manager']},e),2);assert.equal(manager(s,{...u,roles:['Director']}),false);assert.equal(entityAccess(s,{...u,admin:true},e),3);assert.equal(entityAccess(s,{...u,admin:true,active:false},e),0);});
test('latest workbook prices retain every displayed tier and missing-package distinction',()=>{assert.equal(seedRules.prices.length,112);const amount=(id:string)=>seedRules.prices.find(p=>p.id===id)!.amount;assert.equal(amount('A-10-10'),9700);assert.equal(amount('B-22-9'),7700);assert.equal(amount('C-34-11'),4320);assert.equal(amount('D-61-11'),109400);assert.equal(amount('D-51-12'),null);assert.equal(amount('A-14-11'),11200);assert.equal(amount('B-26-11'),8700);assert.equal(seedRules.prices.find(p=>p.id==='A-11-9')!.level,'Secondary 1–2 / IP·IB Y1–2');assert.equal(seedRules.prices.find(p=>p.id==='B-25-9')!.level,'JC / IB / IP Y5–Y6');});

test("recipient payments round independently at half-dollar boundaries",()=>{assert.deepEqual(earnings(1000,0,[4.9,5,5.1,0],"gross").commissions,[0,100,100,0]);const r=earnings(1000,0,[5,5,5,5],"gross");assert.equal(r.retained,600);assert.equal(r.teacher!+r.commissions.reduce<number>((a,b)=>a+b!,0)+r.retained!,1000);});

import {breakeven,combineStaff,cumulative,onlineSales,salesProfile,withOnlineSales} from '../lib/online-budget';
test('online breakeven reconciles v4 full-year target with its loss-making ramp',()=>{
 const b=budgetTemplate(true),{result,external,share}=onlineSales(b,seedRules),target=breakeven(b,seedRules,share)!;
 assert.ok(Math.abs(target.external-32814720)<=12);assert.ok(Math.abs(external!-20509200)<=12);
 assert.ok(Math.abs(annual(result.net)!+7690950)<=12);assert.ok(Math.abs(annual(target.result.net)!)<=12);
 const ramp=calculate(withOnlineSales(b,target.external*.625,share,.25),seedRules);
 assert.ok(Math.abs(annual(ramp.net)!+7690950)<=12);assert.equal(salesProfile(b)!.linear,true);
 assert.equal(annual(result.rows.staff),10200000);assert.equal(b.lines.some(l=>['admin','manager'].includes(l.id)),false);
});
test('staff combination preserves edited months and blanks without mutating source or breaking references',()=>{
 const b=budgetTemplate(true),staff=b.lines.findIndex(l=>l.id==='staff');
 b.lines.splice(staff,1,{...b.lines[staff],id:'admin',values:Array(12).fill(450000)},{...b.lines[staff],id:'manager',values:Array(12).fill(400000)});
 b.lines.find(l=>l.id==='admin')!.values[0]=600000;
 const before=calculate(b,seedRules),merged=combineStaff(b);assert.deepEqual(calculate(merged,seedRules).net,before.net);assert.equal(merged.lines.find(l=>l.id==='staff')!.values[0],1000000);assert.ok(b.lines.some(l=>l.id==='admin'));
 b.lines.find(l=>l.id==='admin')!.values[1]=null;assert.equal(combineStaff(b).lines.find(l=>l.id==='staff')!.values[1],null);
 b.lines.push({id:'staffTax',name:'Staff tax',method:'percent',category:'operating_cost',values:Array(12).fill(0),baseId:'admin',rate:5});assert.deepEqual(combineStaff(b),b);
});
test('online target preserves custom extra costs and saved rules, and rejects unknown or non-contributing cases',()=>{
 const b=budgetTemplate(true);const target=breakeven(b,seedRules,.6)!;
 b.lines.push({id:'extra',name:'Additional expense',method:'manual',category:'operating_cost',values:Array(12).fill(100000),rate:null});
 const higher=breakeven(b,seedRules,.6)!;assert.ok(Math.abs(higher.external-target.external-1920000)<=20);
 b.lines.find(l=>l.id==='extra')!.values[0]=null;assert.equal(breakeven(b,seedRules,.6),null);
 const loss=budgetTemplate(true);loss.lines.find(l=>l.id==='teachers')!.rate=200;assert.equal(breakeven(loss,seedRules,.6),null);
 const covered=budgetTemplate(true);delete covered.lines.find(l=>l.id==='ah')!.driver;covered.lines.find(l=>l.id==='ah')!.values=Array(12).fill(10000000);assert.equal(breakeven(covered,seedRules,.6)!.external,0);
 assert.deepEqual(cumulative([-30,10,null,30]),[-30,-20,null,null]);
});
test('sales reshaping retains annual total, monthly non-sales values and formula lines',()=>{
 const b=budgetTemplate(true),newBudget=withOnlineSales(b,40000000,.7,.4),r=calculate(newBudget,seedRules);
 assert.ok(Math.abs(annual(r.rows.c)!-28000000)<=6);assert.ok(Math.abs(annual(r.rows.d)!-12000000)<=6);
 for(const line of b.lines.filter(l=>!['c','d'].includes(l.id)))assert.deepEqual(newBudget.lines.find(l=>l.id===line.id),line);
 const profile=salesProfile(newBudget)!;assert.ok(Math.abs(profile.start-.4)<.000001);assert.equal(profile.linear,true);
 newBudget.lines.find(l=>l.id==='c')!.values[5]!+=100000;assert.equal(salesProfile(newBudget)!.linear,false);
});

import {deriveLine,materializeBudget,withKnownDrivers} from '../lib/budget-drivers';
import {budgetCashflow,cashflowSource,seasonalCollections} from '../lib/budget-cashflow';
test('referral factors drive effective commission and cannot be bypassed with cached rates',()=>{
 const b=budgetTemplate(true),cc=b.lines.find(l=>l.id==='cc')!;
 cc.driver={kind:'referral',referred:40,commission:15};cc.rate=99;
 const r=calculate(b,seedRules);assert.equal(deriveLine(cc).rate,6);assert.equal(r.rows.cc[0],Math.round(r.rows.c[0]!*.06));
 cc.driver.referred=0;assert.equal(calculate(b,seedRules).rows.cc[0],0);
 cc.driver.referred=null;assert.equal(annual(calculate(b,seedRules).net),null);
});
test('AH factors reconcile yearly cents; CPF displays base and employer cost without changing initial totals',()=>{
 const b=budgetTemplate(true),ah=b.lines.find(l=>l.id==='ah')!,director=b.lines.find(l=>l.id==='director')!;
 assert.equal(annual(calculate(b,seedRules).rows.ah),10198800);assert.equal(calculate(b,seedRules).rows.director[0],109000);
 ah.driver={kind:'ah-access',accounts:1,fee:100,multiplier:1};ah.values=Array(12).fill(999999);
 const material=materializeBudget(b);assert.equal(annual(material.lines.find(l=>l.id==='ah')!.values),100);assert.equal(annual(calculate(b,seedRules).rows.ah),100);
 director.driver={kind:'employer-cpf',base:200000,cpf:10};assert.equal(calculate(b,seedRules).rows.director[0],220000);
 ah.driver.accounts=null;assert.equal(calculate(b,seedRules).rows.ah[0],null);
});
test('legacy assumption migration preserves custom values and does not infer unknown component rates',()=>{
 const b=budgetTemplate(true);b.lines.forEach(l=>delete l.driver);
 const before=calculate(b,seedRules);assert.deepEqual(calculate(withKnownDrivers(b),seedRules),before);
 b.lines.find(l=>l.id==='cc')!.rate=7;b.lines.find(l=>l.id==='ah')!.values[0]=1000000;
 const n=withKnownDrivers(b);assert.equal(n.lines.find(l=>l.id==='cc')!.driver,undefined);assert.equal(n.lines.find(l=>l.id==='ah')!.driver,undefined);
 assert.deepEqual(calculate(n,seedRules),calculate(b,seedRules));
});
test('invalid driver and cashflow inputs are rejected',()=>{
 const b=budgetTemplate(true),cc=b.lines.find(l=>l.id==='cc')!;
 cc.driver={kind:'referral',referred:101,commission:15};assert.throws(()=>validateBudget(b,seedRules),/assumptions/);
 cc.driver={kind:'referral',referred:30,commission:15};cc.rateSource='teacher';assert.throws(()=>validateBudget(b,seedRules),/assumptions/);
 delete cc.driver;cc.rateSource='custom';b.cashflow={annualTarget:100,openingCash:0,payments:Array(11).fill(null)};assert.throws(()=>validateBudget(b,seedRules),/cashflow/);
 b.cashflow.payments=Array(12).fill(null);b.cashflow.annualTarget=-1;assert.throws(()=>validateBudget(b,seedRules),/cashflow/);
 b.cashflow.annualTarget=1.2;assert.throws(()=>validateBudget(b,seedRules),/cashflow/);
});
test('seasonal collections use full-year 2025 pattern and allocate cents exactly',()=>{
 assert.ok(Math.abs(cashflowSource.shares.reduce((s,v)=>s+v,0)-1)<1e-12);
 assert.ok(Math.abs(cashflowSource.shares[0]-64911/507713)<1e-12);
 assert.ok(Math.abs(cashflowSource.shares[11]-21110/507713)<1e-12);
 for(const total of [0,1,12,10000,30708000,1e12]){const values=seasonalCollections(total);assert.equal(annual(values),total);assert.ok(values.every(v=>Number.isInteger(v)));}
 assert.equal(annual(seasonalCollections(null)),null);
});
test('cashflow respects opening balances, target and zero-payment overrides without changing P&L',()=>{
 const b=budgetTemplate(true),before=clone(b),p=calculate(b,seedRules),f=budgetCashflow(b,seedRules);
 assert.deepEqual(b,before);assert.equal(annual(f.collections),annual(p.revenue));assert.equal(annual(f.net),annual(p.net));assert.ok(f.closing.every(v=>v===null));
 b.cashflow={annualTarget:null,openingCash:10000000,payments:Array(12).fill(null)};
 const full=budgetCashflow(b,seedRules);assert.equal(full.closing[11],10000000+annual(full.net)!);assert.equal(full.opening[1],full.closing[0]);
 b.cashflow.annualTarget=0;b.cashflow.payments[0]=0;const zero=budgetCashflow(b,seedRules);assert.equal(annual(zero.collections),0);assert.equal(zero.payments[0],0);assert.equal(zero.net[0],0);
 assert.deepEqual(calculate(b,seedRules),p);
});
test('cashflow unknown expenses propagate and payment overrides can supply known cash timing',()=>{
 const b=budgetTemplate(true);b.lines.find(l=>l.id==='staff')!.values[0]=null;
 b.cashflow={annualTarget:12000000,openingCash:0,payments:Array(12).fill(null)};
 assert.equal(budgetCashflow(b,seedRules).net[0],null);assert.equal(budgetCashflow(b,seedRules).closing[11],null);
 b.cashflow.payments[0]=1000;assert.notEqual(budgetCashflow(b,seedRules).closing[11],null);
});

test('online cost presentation preserves existing CPF totals and extra costs while removing the director driver',()=>{
 const b=budgetTemplate(true),line=b.lines.find(l=>l.id==='director')!;
 line.driver={kind:'employer-cpf',base:200000,cpf:10};
 const before=calculate(b,seedRules),next=withKnownDrivers(b);
 assert.deepEqual(calculate(next,seedRules).net,before.net);
 assert.equal(next.lines.find(l=>l.id==='director')!.name,'Management Support Cost');
 assert.equal(next.lines.find(l=>l.id==='director')!.driver,undefined);
 assert.equal(next.lines.find(l=>l.id==='director')!.values[0],220000);
 assert.deepEqual(next.lines.filter(l=>l.category==='operating_cost').map(l=>l.id),['director','tech','hosting','staff','marketing','launch','curriculum']);
 assert.ok(next.lines.some(l=>l.id==='curriculum'));
 assert.deepEqual(withKnownDrivers(next),next);
});

import {onlineCashflow,onlinePeriods} from '../lib/budget-cashflow';
test('online cashflow covers Sep 2026 to Dec 2027, reconciles launch payments and opening balances',()=>{
 const b=budgetTemplate(true),before=JSON.stringify(b),f=onlineCashflow(b,seedRules);
 assert.deepEqual(onlinePeriods[0],{year:2026,month:8});assert.deepEqual(onlinePeriods[15],{year:2027,month:11});
 assert.equal(f.opening[0],3250000);assert.equal(f.opening[4],f.closing[3]);
 const launch=f.rows.find(l=>l.id==='launch')!;
 assert.deepEqual(launch.values,[0,750000,750000,750000,750000,...Array(11).fill(0)]);
 assert.equal(annual(launch.values),3000000);
 assert.equal(f.rows.find(l=>l.id==='marketing')!.values[0],200000);
 assert.equal(f.rows.find(l=>l.id==='staff')!.values[0],850000);
 const base=calculate(b,seedRules);
 for(const l of b.lines.filter(l=>l.category==='revenue')){
  const row=f.rows.find(x=>x.id===l.id)!;
  assert.equal(annual(row.values.slice(4)),annual(base.rows[l.id]));
  if(l.id==='ah')assert.deepEqual(row.values.slice(0,4),[0,849900,849900,849900]);else assert.deepEqual(row.values.slice(0,4),seasonalCollections(annual(base.rows[l.id])).slice(8));
 }
 const c=f.rows.find(l=>l.id==='c')!,cc=f.rows.find(l=>l.id==='cc')!;
 assert.equal(cc.values[0],Math.round(c.values[0]!*.045));
 assert.equal(f.closing[15],3250000+annual(f.receipts)!-annual(f.payments)!);
 assert.equal(JSON.stringify(b),before);
});
test('period overrides preserve zero, validate inputs, and reconcile payment adjustments',()=>{
 const b=budgetTemplate(true);b.cashflow={annualTarget:12345678,openingCash:null,payments:Array(12).fill(null),periodPayments:Array(16).fill(null),septemberOpening:0};
 b.cashflow.periodPayments![0]=0;
 const f=onlineCashflow(b,seedRules);
 assert.equal(annual(f.receipts.slice(4)),12345678);assert.equal(f.opening[0],0);assert.equal(f.payments[0],0);assert.equal(f.adjustment[0],-f.expense[0]!);
 b.cashflow.septemberOpening=null;assert.equal(onlineCashflow(b,seedRules).closing[15],null);
 b.cashflow.periodPayments=[0];assert.throws(()=>validateBudget(b,seedRules),/period cash/);
 b.cashflow.periodPayments=Array(16).fill(null);b.cashflow.septemberOpening=1.5;assert.throws(()=>validateBudget(b,seedRules),/opening cash/);
});

import {visibleBudgets,selectedBudget} from '../lib/planning-selection';
test('budget navigation restores database record and separates published snapshots from drafts',()=>{
 const payload=budgetTemplate(true),published=structuredClone(payload);published.notes='Published';payload.notes='Working draft';
 const data={manage:true,entities:[{id:'online',kind:'online'}],budgets:[{id:'one',entity_id:'online',payload,published_data:{entity_id:'online',payload:published}},{id:'two',entity_id:'online',payload}]};
 assert.equal(selectedBudget(data,false,'two').id,'two');assert.equal(selectedBudget(data,false).payload.notes,'Working draft');
 assert.equal(selectedBudget(data,true,'one').payload.notes,'Published');assert.equal(visibleBudgets(data,true).length,1);
 const reader={...data,manage:false,budgets:[{id:'one',entity_id:'online',payload:published,status:'published'}]};
 assert.equal(selectedBudget(reader,true).payload.notes,'Published');
 assert.equal(selectedBudget({...data,budgets:[]},true),null);
});

import {cashflowBreakeven} from '../lib/online-budget';
test('cashflow breakeven covers the full period without consuming opening cash',()=>{
 const b=budgetTemplate(true),before=JSON.stringify(b),target=cashflowBreakeven(b,seedRules,.6)!;
 const flow=onlineCashflow(target.budget,seedRules),net=annual(flow.net)!;
 assert.ok(net>=0&&net<100, String(net));assert.ok(Math.abs(flow.closing[15]!-3250000)<100);
 assert.deepEqual(flow.rows.find(l=>l.id==='ah')!.values,[0,...Array(15).fill(849900)]);
 assert.equal(JSON.stringify(b),before);
 b.lines.find(l=>l.id==='tech')!.values=Array(12).fill(900000);
 assert.ok(cashflowBreakeven(b,seedRules,.6)!.external>target.external);
});
