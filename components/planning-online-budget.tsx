'use client';
import React,{useMemo,useState} from 'react';
import {annual,Budget,calculate,clone,Line,Rules} from '@/lib/planning';
import {cashflowBreakeven,onlineSales,salesProfile,withOnlineSales} from '@/lib/online-budget';
import {PlanningBudgetAssumptions} from './planning-budget-assumptions';
import {onlineCashflow} from '@/lib/budget-cashflow';
import {PlanningCashflow} from './planning-cashflow';
import {wholeMoney as money,Num} from './planning-controls';

type Props={budget:Budget;rules:Rules;year:number;editable:boolean;onChange:(b:Budget)=>void};
const pct=(n:number)=>`${(n*100).toFixed(1)}%`;
const sum=(b:Budget,result:ReturnType<typeof calculate>,category:string)=>annual(b.lines.filter(l=>l.category===category).flatMap(l=>result.rows[l.id]));
export function PlanningOnlineBudget({budget:b,rules,year,editable,onChange}:Props){
 const [cFee,setCFee]=useState(50490),[dFee,setDFee]=useState(48090);
 const model=useMemo(()=>{try{
  const {result,external,share}=onlineSales(b,rules),profile=salesProfile(b);
  const target=profile?cashflowBreakeven(b,rules,share):null;
  const sensitivity=profile?[.4,.6,.8].map(s=>({share:s,target:cashflowBreakeven(b,rules,s)})):[];
  return {result,external,share,profile,target,sensitivity,error:''};
 }catch(e){return {error:(e as Error).message};}},[b,rules]);
 if(!model.result)return <p role="alert" className="warning">{model.error}</p>;
 const {result,external,share,profile,target,sensitivity}=model;
 const ah=annual(result.rows.ah||[null]),fixed=sum(b,result,'operating_cost');
 const flow=onlineCashflow(b,rules);
 const guided=profile!==null&&external!==null;
 const changeSales=(sales:number,part=share,start=profile?.start??1)=>onChange(withOnlineSales(b,sales,part,start));
 const changeLine=(id:string,value:number|null,rate=false)=>{const n=clone(b),line=n.lines.find(l=>l.id===id)!;if(rate)line.rate=value;else line.values=Array(12).fill(value);onChange(n);};
 const manual=(l:Line)=>l.method==='manual'&&l.values.every(v=>v===l.values[0]);
 const costs=b.lines.filter(l=>l.category==='operating_cost');
 const targetRows=target?.result;
 return <div className="online-budget">
  <header className="online-hero"><small>ASPIRE ONLINE · SEPTEMBER 2026–DECEMBER 2027</small><h2>Product C + D: cashflow and costs</h2><p>Project cash receipts, payments and balances from September 2026 to December 2027. Changing the assumptions recalculates the report; Save draft and Publish control which values are shared.</p></header>
  <nav className="online-nav" aria-label="Budget report sections">{[['assumptions','Assumptions'],['overview','At a glance'],['ah','AH revenue'],['costs','Cost budget'],['breakeven','Breakeven'],['volume','Sales volumes'],['sensitivity','Sensitivity'],['cashflow','Annual & monthly cashflow']].map(([id,label])=><a key={id} href={'#online-'+id}>{label}</a>)}</nav>
  <section id="online-assumptions"><h3>Assumptions — edit the budget</h3><p>Amounts are in Singapore dollars. Blank values remain pending. The detailed budget inputs below retain additional lines and individual monthly cost adjustments.</p>
   <fieldset disabled={!editable}><div className="planning-fields">
    <label>Projected external sales · full year<Num label="Projected annual external sales" money value={external} disabled={!guided} step="100" onChange={(v:number|null)=>{if(v!==null)changeSales(v);}}/><small>Combined Product C and D revenue in this budget.</small></label>
    <label>Product C share of external sales (%)<Num label="Product C sales share" value={Number((share*100).toFixed(2))} disabled={!guided} max={100} step="1" onChange={(v:number|null)=>{if(v!==null&&v<=100)changeSales(external!,v/100);}}/><small>Product D: {pct(1-share)}. Based on annual sales.</small></label>

   </div></fieldset><PlanningBudgetAssumptions budget={b} rules={rules} share={share} editable={editable} onChange={onChange}/>
   {!guided&&<p className="warning">Use the detailed budget inputs to complete or edit Product C and D monthly revenue before using the guided breakeven model.</p>}
  </section>
  <section id="online-overview"><h3>At a glance</h3><div className="planning-kpis">
   <div><small>Cash receipts · Sep 2026–Dec 2027</small><strong>{money(annual(flow.receipts))}</strong><p>Collections use the workbook’s monthly ratios.</p></div>
   <div><small>Net cashflow · 16 months</small><strong>{money(annual(flow.net))}</strong><p>Receipts less cash payments.</p></div>
   <div><small>Annual sales target · cashflow breakeven</small><strong>{target?money(target.external):'Not available'}</strong><p>{target?.covered?'Other income already covers costs.':'Annual sales target for zero net cashflow over the 16-month projection.'}</p></div>
   <div><small>Closing cash · December 2027</small><strong>{money(flow.closing[15])}</strong><p>Includes the opening September cash balance.</p></div>
  </div></section>
  <section id="online-ah"><h3>1. E-Learning revenue from Aspire Hub students</h3><div className="planning-scroll"><table><thead><tr><th>Revenue source</th><th>Annual budget</th><th>Monthly average</th></tr></thead><tbody><tr><th>AH access fees<small>Independent of the external C : D sales mix</small></th><td>{money(ah)}</td><td>{money(ah===null?null:ah/12)}</td></tr></tbody></table></div></section>
  <section id="online-costs"><h3>2. Cost budget</h3><p>Staff Cost combines manager and admin costs. Management Support Cost is entered directly below.</p><fieldset disabled={!editable}><div className="planning-scroll"><table><thead><tr><th>Cost</th><th>Monthly amount</th><th>Annual budget</th></tr></thead><tbody>{costs.map(l=><tr key={l.id}><th>{l.name}{l.id==='launch'&&<small>Includes marketing costs and free classes.</small>}</th><td>{l.driver?<span>{money(annual(l.values)===null?null:annual(l.values)!/12)}<small>Calculated from assumptions above</small></span>:manual(l)?<Num label={l.name+' monthly cost'} value={l.values[0]} money step="100" onChange={(v:number|null)=>changeLine(l.id,v)}/>:<span>Varies by month<small>Edit below</small></span>}</td><td>{money(annual(result.rows[l.id]))}</td></tr>)}<tr className="planning-total"><th>Total operating costs, including one-offs</th><td></td><td>{money(fixed)}</td></tr></tbody></table></div></fieldset><p>Teacher costs and referral commissions vary with collections. Recurring costs start in September 2026; the launch budget is paid equally over October 2026–January 2027.</p></section>
  <section id="online-breakeven"><h3>3. Cashflow breakeven · September 2026–December 2027</h3><p>This target uses the monthly collection ratios, AH fees received one month later, and the full 16-month payment schedule. Only external C and D sales change, holding the annual product mix at {pct(share)} : {pct(1-share)}.</p>
   {!target?<p className="warning">A breakeven target cannot be calculated while values are pending or external sales do not produce a positive contribution. Review the detailed budget inputs.</p>:<>
    <p>Annual external sales target: <strong>{money(target.external)}</strong>. This produces approximately zero net cashflow over the full projection. Opening cash is not counted as income; individual months may still have shortfalls.</p>
    {editable&&guided&&<button onClick={()=>onChange(target.budget)}>Use cashflow breakeven sales</button>}
   </>}
  </section>
  <section id="online-volume"><h3>4. What the external revenue means in sales volumes</h3><p>Illustrative equivalents, not unique students: Product C is a 12-class block; Product D is a one-subject year. The initial averages below come from the v4 report. Adjust them for the expected sales mix. These calculator inputs do not change or save budget values.</p><div className="planning-fields"><label>Average Product C 12-class block<Num money value={cFee} disabled={!editable} step="1" onChange={(v:number|null)=>setCFee(v??0)}/></label><label>Average Product D one-subject year<Num money value={dFee} disabled={!editable} step="1" onChange={(v:number|null)=>setDFee(v??0)}/></label></div><div className="planning-scroll"><table><thead><tr><th>Product</th><th>Budget equivalents</th><th>Breakeven equivalents</th></tr></thead><tbody>{[['c','C · 12-class blocks',cFee],['d','D · subject-years',dFee]].map(([id,label,fee])=><tr key={id}><th>{label}</th>{[result,targetRows].map((r,i)=>{const v=r?annual(r.rows[id]||[null]):null;return <td key={i}>{v===null||!fee?'Pending':Math.ceil(v/Number(fee)).toLocaleString('en-SG')}</td>;})}</tr>)}</tbody></table></div></section>
  <section id="online-sensitivity"><h3>5. Sensitivity — external sales mix</h3><p>Annual external sales target for 16-month cashflow breakeven when the C : D mix changes.</p><div className="planning-scroll"><table><thead><tr><th>Product C : D</th><th>External sales required</th></tr></thead><tbody>{sensitivity.map(s=><tr key={s.share}><th>{pct(s.share)} : {pct(1-s.share)}</th><td>{s.target?money(s.target.external):'No feasible target / pending'}</td></tr>)}</tbody></table></div></section>
  <PlanningCashflow budget={b} rules={rules} year={year} editable={editable} onChange={onChange}/>
  <p className="online-source">Presentation based on Aspire_Online_Budget_2027_v4_interactive.html. Financial results use the selected Connect scenario; its saved assumptions are retained. Cashflow is a projection, not an actual-results report.</p>
 </div>;
}
