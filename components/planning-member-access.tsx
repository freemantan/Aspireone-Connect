'use client';
import {useState} from 'react';
import {Users} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
const abbreviation=(u:any)=>u.abbreviation?.trim()||u.name?.trim().split(/\s+/).map((x:string)=>x[0]).join('').slice(0,4).toUpperCase()||'?';
export function PlanningMemberAccess({record,users,editable,onSave}:{record:any;users:any[];editable:boolean;onSave:(members:string[]|null)=>Promise<void>}){
 const [open,setOpen]=useState(false),[person,setPerson]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selected=record.payload.memberAccess??null;
 const active=users.filter(u=>u.active&&!u.deleted&&!u.onboarding).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const members=active.filter(u=>u.admin||selected===null||selected.includes(u.id));
 const options=active.filter(u=>!members.some(m=>m.id===u.id));
 async function save(next:string[]|null){setBusy(true);setError('');try{await onSave(next);setPerson('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><div className="plan-members-heading"><strong>{record.name||'Plan'}</strong><div className="plan-members-actions"><div className="avatars" aria-label="Members with access">{members.slice(0,4).map(u=><span key={u.id} className="avatar" title={u.name+' · '+u.email}>{abbreviation(u)}</span>)}{members.length>4&&<span className="avatar" title={members.slice(4).map(u=>u.name).join(', ')}>+{members.length-4}</span>}</div><button onClick={()=>{setError('');setOpen(true);}}><Users size={16}/>Members</button></div></div>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="portal-dialog"><DialogTitle>Members · {record.name||'Plan'}</DialogTitle><DialogDescription>People with access to this plan. Short names show membership, not who is currently online.</DialogDescription><div className="detail-body">
 <p>Members can view published values. Saving and publishing remain administrator-only. Membership changes are saved immediately.</p>
 {error&&<p role="alert" className="warning">{error}</p>}
 {editable&&<><form onSubmit={e=>{e.preventDefault();if(person)save([...members.map(u=>u.id),person]);}}><label>Person<select required value={person} disabled={busy} onChange={e=>setPerson(e.target.value)}><option value="">Choose a person</option>{options.map(u=><option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label><label>Plan access<select disabled value="View"><option>View</option></select></label><button className="primary" disabled={busy||!person}>Add member</button></form><label><input type="checkbox" checked={selected===null} disabled={busy} onChange={e=>save(e.target.checked?null:members.map(u=>u.id))}/> Automatically include all active members</label></>}
 <h3>Plan members · {members.length}</h3>{members.map(u=><div className="member-row" key={u.id}><span className="avatar" title={u.name+' · '+u.email}>{abbreviation(u)}</span><span>{u.name}<small>{u.email}</small></span><span>{u.admin?'Administrator':'View'}</span>{editable&&<button disabled={busy||u.admin} onClick={()=>{if(confirm('Remove '+u.name+'’s access to this plan?'))save(members.filter(m=>m.id!==u.id&&!m.admin).map(m=>m.id));}}>Remove member</button>}</div>)}
 {!record.id&&<p>Save this plan before managing members.</p>}<p className="muted">Administrators always have access. Budget viewers also need access to Prices and Commissions.</p>
 </div></DialogContent></Dialog></>;
}
