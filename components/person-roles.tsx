'use client';
import {useState} from 'react';
import {RoleChecks} from './article-board';
export function PersonRoles({person,admin=false,act}:any){
 const [editing,setEditing]=useState(false),[roles,setRoles]=useState<string[]>(person.roles||[]),[busy,setBusy]=useState(false);
 if(!admin)return <p><strong>Roles:</strong> {(person.roles||[]).join(', ')||'None assigned'} · Assigned by your system administrator</p>;
 return <section><p><strong>Roles:</strong> {(person.roles||[]).join(', ')||'None assigned'}</p>{!editing?<button onClick={()=>{setRoles(person.roles||[]);setEditing(true);}}>Assign roles</button>:<><RoleChecks value={roles} onChange={setRoles}/><button disabled={busy} onClick={async()=>{setBusy(true);try{await act({op:'roles.assign',user:person.id,roles});setEditing(false);}catch{}finally{setBusy(false);}}}>Save roles</button><button disabled={busy} onClick={()=>setEditing(false)}>Cancel</button></>}</section>;
}
