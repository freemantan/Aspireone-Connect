'use client';
import React,{useMemo,useState} from 'react';
import {annual,Budget,calculate,clone,Line,months,Rules} from '@/lib/planning';
import {breakeven,cumulative,onlineSales,salesProfile,withOnlineSales} from '@/lib/online-budget';
import {PlanningBudgetAssumptions} from './planning-budget-assumptions';
import {PlanningCashflow} from './planning-cashflow';
import {money,Num} from './planning-controls';

type Props={budget:Budget;rules:Rules;year:number;editable:boolean;onChange:(b:Budget)=>void};
const pct=(n:number)=>`${(n*100).toFixed(1)}%`;
const sum=(b:Budget,result:ReturnType<typeof calculate>,category:string)=>annual(b.lines.filter(l=>l.category===category).flatMap(l=>result.rows[l.id]));
export function PlanningOnlineBudget({budget:b,rules,year,editable,onChange}:Props){
 const [cFee,setCFee]=useState(50490),[dFee,setDFee]=useState(48090);
 const model=useMemo(()=>{try{
  const {result,external,share}=onlineSales(b,rules),profile=salesProfile(b);
  const target=profile?breakeven(b,rules,share):null;
  const sensitivity=profile?[.4,.6,.8].map(s=>({share:s,target:breakeven(b,rules,s)})):[];
  return {result,external,share,profile,target,sensitivity,error:''};
 }catch(e){return {error:(e as Error).message};}},[b,rules]);
 if(!model.result)return <p role="alert" className="warning">{model.error}</p>;
 const {result,external,share,profile,target,sensitivity}=model;
 const net=annual(result.net),ah=annual(result.rows.ah||[null]),fixed=sum(b,result,'operating_cost'),total=annual(result.revenue),cumulativeNet=cumulative(result.net);
 const shortfall=cumulativeNet.some(v=>v===null)?null:Math.max(0,-Math.min(0,...cumulativeNet as number[]));
 const guided=profile!==null&&external!==null;
 const changeSales=(sales:number,part=share,start=profile?.start??1)=>onChange(withOnlineSales(b,sales,part,start));
 const changeLine=(id:string,value:number|null,rate=false)=>{const n=clone(b),line=n.lines.find(l=>l.id===id)!;if(rate)line.rate=value;else line.values=Array(12).fill(value);onChange(n);};
 const manual=(l:Line)=>l.method==='manual'&&l.values.every(v=>v===l.values[0]);
 const costs=b.lines.filter(l=>l.category==='operating_cost');
 const annualRow=(label:string,current:number|null,required:number|null)=> <tr key={label}><th>{label}</th><td>{money(current)}</td><td>{money(required)}</td></tr>;
 const targetRows=target?.result;
 return <div className="online-budget">
  <header className="online-hero"><small>ASPIRE ONLINE · BUDGET & SCENARIOS · {year}</small><h2>Product C + D: budget, costs and breakeven</h2><p>Compare your projected year with the sales needed to cover costs. Changing the assumptions recalculates the report; Save draft and Publish control which values are shared.</p></header>
  <nav className="online-nav" aria-label="Budget report sections">{[['assumptions','Assumptions'],['overview','At a glance'],['ah','AH revenue'],['costs','Cost budget'],['breakeven','Breakeven'],['volume','Sales volumes'],['sensitivity','Sensitivity'],['monthly','Monthly P&L'],['cashflow','Cashflow']].map(([id,label])=><a key={id} href={'#online-'+id}>{label}</a>)}</nav>
  <section id="online-assumptions"><h3>Assumptions — edit the budget</h3><p>Amounts are in Singapore dollars. Blank values remain pending. The detailed P&L editor below retains additional lines and individual monthly adjustments.</p>
   <fieldset disabled={!editable}><div className="planning-fields">
    <label>Projected external sales · full year<Num label="Projected annual external sales" money value={external} disabled={!guided} step="100" onChange={(v:number|null)=>{if(v!==null)changeSales(v);}}/><small>Combined Product C and D revenue in this budget.</small></label>
    <label>Product C share of external sales (%)<Num label="Product C sales share" value={Number((share*100).toFixed(2))} disabled={!guided} max={100} step="1" onChange={(v:number|null)=>{if(v!==null&&v<=100)changeSales(external!,v/100);}}/><small>Product D: {pct(1-share)}. Based on annual sales.</small></label>
    <label>January sales as % of December<Num label="January sales percentage" value={profile?Number((profile.start*100).toFixed(2)):null} disabled={!guided} max={100} step="5" onChange={(v:number|null)=>{if(v!==null&&v<=100)changeSales(external!,share,v/100);}}/><small>Changing the ramp redistributes the annual sales total across the months.</small></label>
   </div></fieldset><PlanningBudgetAssumptions budget={b} rules={rules} share={share} editable={editable} onChange={onChange}/>
   {profile&&!profile.linear&&<p className="warning">This scenario has a custom monthly sales pattern. Editing the sales assumptions above will replace it with a straight-line ramp.</p>}
   {!guided&&<p className="warning">Use the detailed P&L editor to complete or edit Product C and D monthly revenue before using the guided breakeven model.</p>}
  </section>
  <section id="online-overview"><h3>At a glance</h3><div className="planning-kpis">
   <div><small>Budget revenue · {year}</small><strong>{money(total)}</strong><p>External sales {money(external)} + other revenue.</p></div>
   <div><small>Budget net result · {year}</small><strong className={net!==null&&net<0?'online-negative':''}>{money(net)}</strong><p>Your current monthly projection.</p></div>
   <div><small>External sales needed · full year</small><strong>{target?money(target.external):'Not available'}</strong><p>{target?.covered?'Other income already covers costs.':'Sales target for approximately zero annual profit.'}</p></div>
   <div><small>Peak cumulative P&L shortfall</small><strong>{money(shortfall)}</strong><p>A funding indicator; excludes payment timing and opening cash.</p></div>
  </div><div className="online-explanation"><strong>Why breakeven can sit beside a loss</strong><p>The breakeven case asks how much must be sold during the whole year. A business that starts at 25% of that monthly sales level and only reaches 100% in December sells 62.5% of the full-year target. The original v4 model therefore shows a S$76,909.50 loss in its monthly ramp, even though its separate breakeven table shows zero.</p>{target&&external!==null&&<p>This scenario’s external sales are {money(Math.abs(target.external-external))} {external<target.external?'below':'above'} the annual breakeven target.</p>}</div></section>
  <section id="online-ah"><h3>1. E-Learning revenue from Aspire Hub students</h3><div className="planning-scroll"><table><thead><tr><th>Revenue source</th><th>Annual budget</th><th>Monthly average</th></tr></thead><tbody><tr><th>AH access fees<small>Independent of the external C : D sales mix</small></th><td>{money(ah)}</td><td>{money(ah===null?null:ah/12)}</td></tr></tbody></table></div></section>
  <section id="online-costs"><h3>2. Cost budget</h3><p>Staff Cost combines admin/customer staff and business management. Director fees and technical support remain separate.</p><fieldset disabled={!editable}><div className="planning-scroll"><table><thead><tr><th>Cost</th><th>Monthly amount</th><th>Annual budget</th></tr></thead><tbody>{costs.map(l=><tr key={l.id}><th>{l.name}</th><td>{l.driver?<span>{money(annual(l.values)===null?null:annual(l.values)!/12)}<small>Calculated from assumptions above</small></span>:manual(l)?<Num label={l.name+' monthly cost'} value={l.values[0]} money step="100" onChange={(v:number|null)=>changeLine(l.id,v)}/>:<span>Varies by month<small>Edit below</small></span>}</td><td>{money(annual(result.rows[l.id]))}</td></tr>)}<tr className="planning-total"><th>Total operating costs, including one-offs</th><td></td><td>{money(fixed)}</td></tr></tbody></table></div></fieldset><p>Teacher costs and referral commissions vary with sales and are shown separately in the P&L. One-off costs remain in their scheduled months.</p></section>
  <section id="online-breakeven"><h3>3. Breakeven requirement and annual P&L</h3><p>The comparison preserves this scenario’s other income, costs, taxes and saved price/commission assumptions. Only external C and D sales change, holding the annual product mix at {pct(share)} : {pct(1-share)}.</p>
   {!target?<p className="warning">A breakeven target cannot be calculated while values are pending or external sales do not produce a positive contribution. Review the detailed P&L.</p>:<>
    <div className="planning-scroll"><table><thead><tr><th>P&L line</th><th>Current budget</th><th>Full-year breakeven case</th></tr></thead><tbody>{b.lines.map(l=>annualRow(l.name,annual(result.rows[l.id]),annual(targetRows!.rows[l.id])))}{annualRow('Total revenue',total,annual(targetRows!.revenue))}{annualRow('Gross profit',annual(result.gross),annual(targetRows!.gross))}{annualRow('Net result',net,annual(targetRows!.net))}</tbody></table></div>
    <p>Amounts are calculated to cents. A few cents may remain after monthly rounding. {target.covered?'No external sales are required to cover this scenario’s costs.':''}</p>
    {editable&&guided&&<div className="online-scenario-actions"><button onClick={()=>changeSales(target.external,share,1)}>Use full-year breakeven sales · flat months</button><button onClick={()=>changeSales(target.external*.625,share,.25)}>Use v4 ramp · 25% in January → 100% in December</button><small>These change the working projection. Save draft or Publish when ready. The ramp can produce an annual loss.</small></div>}
   </>}
  </section>
  <section id="online-volume"><h3>4. What the external revenue means in sales volumes</h3><p>Illustrative equivalents, not unique students: Product C is a 12-class block; Product D is a one-subject year. The initial averages below come from the v4 report. Adjust them for the expected sales mix. These calculator inputs do not change or save budget values.</p><div className="planning-fields"><label>Average Product C 12-class block<Num money value={cFee} disabled={!editable} step="1" onChange={(v:number|null)=>setCFee(v??0)}/></label><label>Average Product D one-subject year<Num money value={dFee} disabled={!editable} step="1" onChange={(v:number|null)=>setDFee(v??0)}/></label></div><div className="planning-scroll"><table><thead><tr><th>Product</th><th>Budget equivalents</th><th>Breakeven equivalents</th></tr></thead><tbody>{[['c','C · 12-class blocks',cFee],['d','D · subject-years',dFee]].map(([id,label,fee])=><tr key={id}><th>{label}</th>{[result,targetRows].map((r,i)=>{const v=r?annual(r.rows[id]||[null]):null;return <td key={i}>{v===null||!fee?'Pending':Math.ceil(v/Number(fee)).toLocaleString('en-SG')}</td>;})}</tr>)}</tbody></table></div></section>
  <section id="online-sensitivity"><h3>5. Sensitivity — external sales mix</h3><p>Full-year external sales required when the C : D mix changes; other assumptions stay the same.</p><div className="planning-scroll"><table><thead><tr><th>Product C : D</th><th>External sales required</th></tr></thead><tbody>{sensitivity.map(s=><tr key={s.share}><th>{pct(s.share)} : {pct(1-s.share)}</th><td>{s.target?money(s.target.external):'No feasible target / pending'}</td></tr>)}</tbody></table></div></section>
  <section id="online-monthly"><h3>6. Monthly projection · {year}</h3><p>The current budget, including the timing of one-off costs. It is not automatically forced to break even.</p><div className="planning-scroll"><table><thead><tr><th>P&L line</th>{months.map(m=><th key={m}>{m}</th>)}<th>Year</th></tr></thead><tbody>{[...b.lines.map(l=>({name:l.name,values:result.rows[l.id],total:false})),...([['Revenue',result.revenue],['Gross profit',result.gross],['Operating result',result.operating],['Net result',result.net]] as const).map(([name,values])=>({name,values,total:true})),{name:'Cumulative net result',values:cumulativeNet,total:true}].map((row,i)=><tr className={row.total?'planning-total':''} key={i}><th>{row.name}</th>{row.values.map((v,j)=><td key={j} className={v!==null&&v<0?'online-negative':''}>{money(v)}</td>)}<td>{money(row.name==='Cumulative net result'?net:annual(row.values))}</td></tr>)}</tbody></table></div></section>
  <PlanningCashflow budget={b} rules={rules} year={year} editable={editable} onChange={onChange}/>
  <p className="online-source">Presentation based on Aspire_Online_Budget_2027_v4_interactive.html. Financial results use the selected Connect scenario; its saved assumptions are retained. Budget projections are not cash receipts or an actual-results report.</p>
 </div>;
}
