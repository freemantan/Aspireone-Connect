import {State,Row,check,find,role,member,archived} from './model';
export function taskEmail(s:State,user:Row,p:any,origin:string){
 const task=find(s,'tasks',p.id);check(role(s,user,task.board)>=2);check(!archived(s,task),'Restore this task before sending notifications',400);
 check(task.version===p.version,'Save the latest task changes before sending',409);
 const ids=[...new Set([task.assignee,...task.team].filter(Boolean))];
 check(Array.isArray(p.recipients)&&p.recipients.length>0&&p.recipients.every((id:string)=>ids.includes(id)&&member(s,task.board,id)),'Select assigned task members to notify',400);
 const recipients=[...new Set(p.recipients as string[])].map(id=>find(s,'users',id));
 const board=find(s,'boards',task.board),url=new URL('/',origin);url.searchParams.set('board',task.board);url.searchParams.set('task',task.id);
 return recipients.map(person=>({to:[person.email],subject:`${task.parent?'Subtask':'Task'} invitation: ${task.title}`,text:`Hello ${person.name},\n\n${user.name} invited you to view ${task.parent?'a subtask':'a task'} on ${board.name}:\n${task.title}\n\nStart date: ${task.start||'Not set'}\nDue date: ${task.due||'Not set'}\n\nOpen the task: ${url.href}\n${person.onboarding?'Sign in with your invited Google account and accept your company invitation first.':''}`}));
}
