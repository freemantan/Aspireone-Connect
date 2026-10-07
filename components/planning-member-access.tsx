'use client';
import {businessRoles} from '@/lib/business-roles';
import {canViewPlan} from '@/lib/planning-access';
import {useEffect,useState} from 'react';
import {Users} from 'lucide-react';
import {Dialog,DialogContent,DialogTitle,DialogDescription} from './ui/dialog';
const abbreviation=(u:any)=>u.abbreviation?.trim()||u.name?.trim().split(/\s+/).map((x:string)=>x[0]).join('').slice(0,4).toUpperCase()||'?';
export function PlanningMemberAccess({record,users,editable,onSave}:{record:any;users:any[];editable:boolean;onSave:(members:string[]|null,roles:Record<string,string>)=>Promise<void>}){
 const [open,setOpen]=useState(false),[person,setPerson]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
 const selected=record.payload.memberAccess??null;
 const [grants,setGrants]=useState<Record<string,string>>(record.payload.roleAccess||{});
 useEffect(()=>{setGrants(record.payload.roleAccess||{});setPerson('');},[record.id,record.revision]);
 const roleMember=(u:any)=>(u.roles||[]).filter((r:string)=>record.payload.roleAccess?.[r]==='View');
 const active=users.filter(u=>u.active&&!u.deleted&&!u.onboarding).sort((a,b)=>(a.name||'').localeCompare(b.name||''));
 const members=active.filter(u=>canViewPlan(record,u));
 const options=active.filter(u=>!members.some(m=>m.id===u.id));
 async function save(next:string[]|null,roles=record.payload.roleAccess||{}){setBusy(true);setError('');try{await onSave(next,roles);setPerson('');}catch(e){setError((e as Error).message);}finally{setBusy(false);}}
 return <><div className="plan-members-heading"><strong>{record.name||'Plan'}</strong><div className="plan-members-actions"><div className="avatars" aria-label="Members with access">{members.slice(0,4).map(u=><span key={u.id} className="avatar" title={u.name+' · '+u.email}>{abbreviation(u)}</span>)}{members.length>4&&<span className="avatar" title={members.slice(4).map(u=>u.name).join(', ')}>+{members.length-4}</span>}</div><button onClick={()=>{setError('');setOpen(true);}}><Users size={16}/>Members</button></div></div>
 <Dialog open={open} onOpenChange={setOpen}><DialogContent className="portal-dialog"><DialogTitle>Members · {record.name||'Plan'}</DialogTitle><DialogDescription>People with access to this plan. Short names show membership, not who is currently online.</DialogDescription><div className="detail-body">
 <p>Members can view published values. Saving and publishing remain administrator-only. Membership changes are saved immediately.</p>
 {error&&<p role="alert" className="warning">{error}</p>}
 {editable&&<><form onSubmit={e=>{e.preventDefault();if(person)save([...(selected||[]),person]);}}><label>Person<select required value={person} disabled={busy} onChange={e=>setPerson(e.target.value)}><option value="">Choose a person</option>{options.map(u=><option key={u.id} value={u.id}>{u.name} — {u.email}</option>)}</select></label><label>Plan access<select disabled value="View"><option>View</option></select></label><button className="primary" disabled={busy||!person}>Add member</button></form><label><input type="checkbox" checked={selected===null} disabled={busy} onChange={e=>save(e.target.checked?null:[])}/> Automatically include all active members</label><p>Turning this off keeps access only for administrators and selected roles. You can then add individual members.</p></>}
 <section><h3>Access by Role</h3><p>Everyone holding a selected role receives View access. Individual and role access are combined; administrators always retain access.</p>{selected===null&&<p>All active members currently have access. Turn off automatic access to restrict this plan to selected members and roles.</p>}{businessRoles.map(role=><label className="role-grant" key={role}>{role}<select aria-label={'Plan access for '+role} disabled={!editable||busy} value={grants[role]||''} onChange={e=>{const next={...grants};if(e.target.value)next[role]=e.target.value;else delete next[role];setGrants(next);}}><option value="">No role access</option><option value="View">View</option></select></label>)}{editable&&<button disabled={busy} onClick={()=>save(selected,grants)}>Save role access</button>}</section>
 <h3>Plan members · {members.length}</h3>{members.map(u=><div className="member-row" key={u.id}><span className="avatar" title={u.name+' · '+u.email}>{abbreviation(u)}</span><span>{u.name}<small>{u.email}</small>{roleMember(u).length>0&&<small>Access by role · {roleMember(u).join(', ')}</small>}</span><span>{u.admin?'Administrator':'View'}</span>{editable&&<button disabled={busy||u.admin||roleMember(u).length>0} title={roleMember(u).length?'Change Access by Role to remove inherited access':undefined} onClick={()=>{if(confirm('Remove '+u.name+'’s access to this plan?'))save((selected===null?active.filter(m=>!m.admin).map(m=>m.id):selected).filter((id:string)=>id!==u.id));}}>Remove member</button>}</div>)}
 {!record.id&&<p>Save this plan before managing members.</p>}<p className="muted">Administrators always have access. Budget viewers also need access to Prices and Commissions.</p>
 </div></DialogContent></Dialog></>;
}
