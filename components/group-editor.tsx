'use client';
import {useState} from 'react';
export function GroupEditor({group,board,act,close,hasTasks}:any){
 const [name,setName]=useState(group.name),[color,setColor]=useState(group.color),[order,setOrder]=useState(group.order),[busy,setBusy]=useState(false);
 const run=async(p:any)=>{setBusy(true);try{await act(p);close();}catch{}finally{setBusy(false);}};
 return <div className="detail-body"><form onSubmit={e=>{e.preventDefault();run({op:'group.update',board:board.id,id:group.id,version:group.version,name:name.trim(),color,order});}}>
 <label>Group Name<input required maxLength={150} disabled={group.archived||busy} value={name} onChange={e=>setName(e.target.value)}/></label>
 <label>Order<input type="number" disabled={group.archived||busy} value={order} onChange={e=>setOrder(Number(e.target.value))}/></label>
 <label>Colour<input type="color" disabled={group.archived||busy} value={color} onChange={e=>setColor(e.target.value)}/></label>
 {!group.archived&&<button className="primary" disabled={busy||!name.trim()||board.archived}>Save group</button>}</form>
 {board.access>=3&&<button disabled={busy||board.archived} onClick={()=>{if(window.confirm(group.archived?'Restore group?':'Archive group and its work? Chats and files are preserved.'))run({op:'group.update',board:board.id,id:group.id,version:group.version,archived:!group.archived});}}>{group.archived?'Restore':'Archive'} group</button>}
 <button className="danger" disabled={busy||hasTasks||board.archived} onClick={()=>{if(window.confirm('Delete empty group “'+group.name+'”?'))run({op:'group.delete',board:board.id,id:group.id,version:group.version,confirm:true});}}>Delete empty group</button>
 {hasTasks&&<p className="muted">Move or delete all tasks, including archived tasks, before deleting this group.</p>}</div>;
}
