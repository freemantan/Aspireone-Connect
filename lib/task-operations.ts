import {State,Row,check,find,role,archived,audit} from './model';
export function taskOperation(s:State,u:Row,p:any){
 const task=find(s,'tasks',p.id);check(task.board===p.board);check(role(s,u,task.board)>=2);
 const board=find(s,'boards',task.board);check(!board.archived,'Restore the board first',400);
 check(task.version===p.version,'This task changed. Refresh before continuing.',409);
 if(p.op==='task.delete'){
  check(p.confirm===true,'Confirm deletion first',400);
  const children=s.tasks.filter(t=>t.parent===task.id);check(children.length===0,'Delete or move all subtasks before deleting this task.',400);
  const ids=new Set([task.id,...children.map(t=>t.id)]);
  s.tasks=s.tasks.filter(t=>!ids.has(t.id));
  for(const t of s.tasks)if(t.depends?.some((id:string)=>ids.has(id))){t.depends=t.depends.filter((id:string)=>!ids.has(id));t.version++;}
  s.messages=s.messages.filter(m=>!ids.has(m.subject));s.reads=s.reads.filter(r=>!ids.has(r.subject));s.notifications=s.notifications.filter(n=>!ids.has(n.subject));
  for(const file of s.files)if(ids.has(file.subject))file.removed=true;
  s.recurrences=s.recurrences.filter(r=>!ids.has(r.task));for(const r of s.recurrences){r.template=r.template.filter((t:Row)=>!ids.has(t.id));for(const t of r.template)t.depends=(t.depends||[]).filter((id:string)=>!ids.has(id));}
  audit(s,u,task.board,task.id,'Task deleted',{title:task.title,subtasks:children.length},null);return;
 }
 if(p.op==='task.restore'){
  check(role(s,u,task.board)>=3);check(!find(s,'groups',task.group).archived,'Restore the group first',400);
  check(!task.parent||!find(s,'tasks',task.parent).archived,'Restore the parent task first',400);
  task.archived=false;task.version++;audit(s,u,task.board,task.id,'Task restored',null,null);return;
 }
 check(p.op==='task.move','Unknown task action',400);check(!archived(s,task),'Restore this task before moving it',400);
 const target=p.target?find(s,'tasks',p.target):null;
 check(!target||target.board===task.board,'Move within the same board',400);
 check(!target||!archived(s,target),'Choose an active target',400);
 check(!target||!!target.parent===!!task.parent,'Move tasks beside tasks, or subtasks beside subtasks',400);
 if(target?.id===task.id)return;
 const parent=target?target.parent:task.parent;
 const group=target?target.group:p.group;
 check(find(s,'groups',group).board===task.board&&!find(s,'groups',group).archived,'Choose an active group on this board',400);
 check(!task.parent||target,'Drop a subtask beside another subtask',400);
 const siblings=s.tasks.filter(t=>t.id!==task.id&&t.board===task.board&&t.group===group&&(t.parent||null)===(parent||null)).sort((a,b)=>(a.order||0)-(b.order||0));
 const index=target?siblings.findIndex(t=>t.id===target.id)+(p.after?1:0):siblings.length;
 task.group=group;task.parent=parent||null;siblings.splice(index,0,task);
 siblings.forEach((t,i)=>{t.order=i;t.version++;});
 if(!task.parent)for(const child of s.tasks.filter(t=>t.parent===task.id)){child.group=group;child.version++;}
 audit(s,u,task.board,task.id,'Task moved',null,{group,parent:task.parent,order:task.order});return;
}
