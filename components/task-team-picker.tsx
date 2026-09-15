'use client';
import {useState} from 'react';
export function TaskTeamPicker({task,members,save}:any){
 const [busy,setBusy]=useState(false);
 const toggle=async(id:string,checked:boolean)=>{setBusy(true);try{await save(checked?[...task.team,id]:task.team.filter((x:string)=>x!==id));}catch{}finally{setBusy(false);}};
 return <details className="task-team-picker"><summary aria-label={'Edit team for '+task.title}>Edit team</summary><div className="member-picker">
 {members.map((person:any)=><label className="check" key={person.id}><input type="checkbox" disabled={busy} checked={task.team.includes(person.id)} onChange={e=>toggle(person.id,e.target.checked)}/>{person.name}{person.onboarding?' · Invited':''}</label>)}
 {!members.length&&<small>Add people through Board Members first.</small>}</div></details>;
}
