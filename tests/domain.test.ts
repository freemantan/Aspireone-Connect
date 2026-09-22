import test from 'node:test';
import {columnOrder,moveColumn} from '../lib/column-order';
import {taskEmail} from '../lib/task-email';

import assert from 'node:assert/strict';
import {initial,mutate,role,view,runRecurrences,completed,overdue,archived,today,addDays,State} from '../lib/model';
import {demo} from '../lib/demo';
import {updateBoardNames,updateCommonColumns} from '../lib/workspace-updates';
import {columnPreferences,standardColumns} from '../lib/column-preferences';
import {provisionInvitedPeople} from '../lib/invited-people';
import {isMp4} from '../lib/video-attachment';
test('MP4 attachment validation accepts a file-type box and rejects renamed or truncated files',()=>{
 const bytes=new Uint8Array([0,0,0,24,102,116,121,112,105,115,111,109,0,0,0,0,105,115,111,109,109,112,52,50]);
 assert.equal(isMp4(bytes),true);assert.equal(isMp4(bytes.slice(0,12)),false);assert.equal(isMp4(new TextEncoder().encode('not really an MP4 video')),false);const invalid=bytes.slice();invalid[3]=99;assert.equal(isMp4(invalid),false);
});
function setup(){const s=initial();demo(s);const admin=s.users[0],viewer=s.users[1],editor=s.users[2],manager=s.users[3],t=s.tasks[0];return {s,admin,viewer,editor,manager,t,b:t.board,g:t.group};}
function update(s:any,u:any,t:any,changes:any,extra={}){return mutate(s,u,{op:'task.update',board:t.board,id:t.id,version:t.version,changes,...extra});}
const denied=(fn:()=>any)=>assert.throws(fn,/Access denied/);
test('Marketing cleanup also removes duplicate Links after the earlier cleanup has run',()=>{
 const {s}=setup();const board=s.boards.find(b=>b.id==='board-1')!,other=s.boards.find(b=>b.id==='board-2')!;board.commonColumnsUpdated=true;
 board.columns.push({id:'duplicate-links',name:'Links',type:'link'},{id:'keep',name:'Campaign URL',type:'link'});other.columns.push({id:'other-links',name:'Links',type:'link'});
 const parent=s.tasks.find(t=>t.board===board.id&&!t.parent)!,child=mutate(s,s.users[0],{op:'task.create',board:board.id,parent:parent.id,title:'Links child'});child.custom={'duplicate-links':{label:'Campaign video',url:'https://example.com/video'}};
 assert.equal(updateCommonColumns(s),true);assert.ok(!board.columns.some((c:any)=>c.id==='duplicate-links'));assert.ok(board.columns.some((c:any)=>c.id==='keep'));assert.ok(other.columns.some((c:any)=>c.id==='other-links'));assert.ok(child.links.some((l:any)=>l.label==='Campaign video'));assert.equal(child.custom['duplicate-links'],undefined);assert.equal(updateCommonColumns(s),false);
});
test('Budget is a standard numeric field on tasks and subtasks',()=>{
 const {s,editor,viewer,t,b}=setup();update(s,editor,t,{budget:123.45});assert.equal(t.budget,123.45);denied(()=>update(s,viewer,t,{budget:1}));assert.throws(()=>update(s,editor,t,{budget:-1}),/Budget/);
 const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Budget child'});assert.equal(child.budget,null);update(s,editor,child,{budget:0});assert.equal(child.budget,0);update(s,editor,t,{budget:null});assert.equal(t.budget,null);
});
test('Marketing Custom Links column is removed once while preserving its URLs in standard Links',()=>{
 const {s}=setup();const board=s.boards.find(b=>b.id==='board-1')!,task=s.tasks.find(t=>t.board===board.id)!;
 board.columns.push({id:'old-link',name:'Custom Links',type:'link'});task.custom={'old-link':{label:'Campaign',url:'https://example.com/campaign'}};
 assert.equal(updateCommonColumns(s),true);assert.ok(!board.columns.some((c:any)=>c.id==='old-link'));assert.ok(task.links.some((l:any)=>l.label==='Campaign'));assert.equal(task.custom['old-link'],undefined);assert.equal(updateCommonColumns(s),false);
});
test('columns can grow, Remark and Links can be hidden, and confirmed deletion removes stored values',()=>{
 const {s,manager,editor,t,b}=setup();const board=s.boards.find(x=>x.id===b)!;
 const columns=Array.from({length:150},(_,i)=>({id:'many-'+i,name:'Column '+i,type:i===0?'link':'text',options:[],archived:false}));
 mutate(s,manager,{op:'settings',board:b,version:board.version,columns,hidden:['remark','links']});assert.equal(board.columns.length,150);assert.deepEqual(board.hidden,['remark','links']);
 update(s,editor,t,{custom:{'many-0':{label:'Project site',url:'https://example.com'},'many-1':'saved'}});assert.equal(t.custom['many-0'].label,'Project site');
 assert.throws(()=>update(s,editor,t,{custom:{'many-0':{label:'Bad',url:'javascript:alert(1)'}}}),/Invalid link/);
 const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});update(s,editor,child,{custom:{'many-0':'https://example.com/legacy'}});
 mutate(s,manager,{op:'settings',board:b,version:board.version,columns:columns.slice(1),deleteColumns:['many-0'],hidden:[]});assert.equal(t.custom['many-0'],undefined);assert.equal(child.custom['many-0'],undefined);assert.equal(t.custom['many-1'],'saved');assert.deepEqual(board.hidden,[]);
});
test('production starts with six empty boards and no invented users',()=>{const s=initial();assert.equal(s.boards.length,6);assert.equal(s.users.length,0);assert.equal(s.tasks.length,0)});
test('groups reorder both directions without moving tasks and reject invalid moves',()=>{
 const {s,editor,viewer,t,b}=setup();const first=mutate(s,editor,{op:'group.create',board:b,name:'First'}),second=mutate(s,editor,{op:'group.create',board:b,name:'Second'});const taskGroup=t.group;
 const move=(user:any,g:any,target:any,extra={})=>mutate(s,user,{op:'group.move',board:b,id:g.id,version:g.version,target:target.id,...extra});
 denied(()=>move(viewer,second,first));move(editor,second,first);assert.ok(second.order<first.order);move(editor,second,first,{after:true});assert.ok(second.order>first.order);assert.equal(t.group,taskGroup);
 assert.throws(()=>move(editor,second,first,{version:0}),/changed/);first.archived=true;assert.throws(()=>move(editor,second,first),/Restore/);first.archived=false;
 const other=s.groups.find(g=>g.board!==b)!;assert.throws(()=>move(editor,second,other),/same board/);assert.equal(new Set(s.groups.filter(g=>g.board===b).map(g=>g.order)).size,s.groups.filter(g=>g.board===b).length);
});
test('sent invitations create stable assignable people without granting access before acceptance',()=>{
 const {s,admin,manager,editor,t,b}=setup();const invite=mutate(s,admin,{op:'company.invite',email:'pending@example.test',name:'Pending Person',mobile:'123',abbreviation:'PP'});
 assert.equal(provisionInvitedPeople(s),false);invite.delivery='failed';assert.equal(provisionInvitedPeople(s),false);
 invite.delivery='sent';assert.equal(provisionInvitedPeople(s),true);const person=s.users.find(u=>u.email===invite.email)!;assert.equal(person.name,'Pending Person');assert.equal(person.mobile,'123');assert.equal(person.abbreviation,'PP');assert.equal(provisionInvitedPeople(s),false);
 mutate(s,manager,{op:'member',board:b,email:invite.email,role:'Edit'});
 update(s,editor,t,{assignee:person.id,team:[person.id]});const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Assigned child'});update(s,editor,child,{assignee:person.id,team:[person.id]});
 assert.equal(role(s,person,b),0);assert.equal(view(s,person).tasks.length,0);denied(()=>update(s,person,t,{remark:'Premature access'}));assert.ok(view(s,editor).users.some((u:any)=>u.id===person.id));assert.equal(view(s,editor).users.find((u:any)=>u.id===person.id).mobile,undefined);
 mutate(s,person,{op:'invite.accept',token:invite.token});assert.equal(role(s,person,b),2);assert.equal(t.assignee,person.id);assert.deepEqual(child.team,[person.id]);assert.equal(s.users.filter(u=>u.email===invite.email).length,1);assert.equal(s.members.filter(m=>m.board===b&&m.user===person.id).length,1);
});
test('sent invite backfill supports adding later board membership and cancellation revokes assignment choices',()=>{
 const {s,admin,manager,editor,t,b}=setup();const i=mutate(s,admin,{op:'company.invite',email:'later@example.test',name:'Later'});i.delivery='sent';provisionInvitedPeople(s);const person=s.users.find(u=>u.email===i.email)!;
 assert.throws(()=>update(s,editor,t,{assignee:person.id}),/board member/);mutate(s,manager,{op:'member',board:b,email:i.email,role:'View'});update(s,editor,t,{assignee:person.id});
 mutate(s,admin,{op:'invite.remove',id:i.id});assert.equal(s.members.some(m=>m.user===person.id),false);assert.throws(()=>update(s,editor,t,{team:[person.id]}),/board member|supporting/);assert.equal(role(s,person,b),0);
 const replacement=mutate(s,admin,{op:'company.invite',email:person.email,name:'Later'});replacement.delivery='sent';provisionInvitedPeople(s);assert.equal(s.users.filter(u=>u.email===person.email).length,1);
});
test('email-only board membership is repaired even when delivery status is stale',()=>{
 const {s,admin,manager,editor,t,b}=setup();const i=mutate(s,admin,{op:'company.invite',email:'missing@example.test',name:'Missing Member'});i.delivery='queued';
 mutate(s,manager,{op:'member',board:b,email:i.email,role:'Edit'});const person=s.users.find(u=>u.email===i.email)!;assert.ok(person);assert.ok(view(s,editor).members.some((m:any)=>m.user===person.id));assert.ok(view(s,editor).users.some((u:any)=>u.id===person.id));
 update(s,editor,t,{assignee:person.id,team:[person.id]});const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});update(s,editor,child,{assignee:person.id,team:[person.id]});assert.equal(role(s,person,b),0);
 const membership=s.members.find(m=>m.user===person.id)!;delete membership.user;i.delivery='failed';assert.equal(provisionInvitedPeople(s),true);assert.equal(membership.user,person.id);assert.equal(provisionInvitedPeople(s),false);
});
test('empty groups can be renamed and deleted with confirmation while nonempty groups are protected',()=>{
 const {s,editor,viewer,b,t}=setup();const g=mutate(s,editor,{op:'group.create',board:b,name:'Original',color:'#123456'});const order=g.order;
 mutate(s,editor,{op:'group.update',board:b,id:g.id,version:g.version,name:'Renamed'});assert.equal(g.name,'Renamed');assert.equal(g.color,'#123456');assert.equal(g.order,order);
 denied(()=>mutate(s,viewer,{op:'group.delete',board:b,id:g.id,version:g.version,confirm:true}));assert.throws(()=>mutate(s,editor,{op:'group.delete',board:b,id:g.id,version:g.version}),/Confirm/);
 const task=mutate(s,editor,{op:'task.create',board:b,group:g.id,title:'Hidden task'});task.archived=true;assert.throws(()=>mutate(s,editor,{op:'group.delete',board:b,id:g.id,version:g.version,confirm:true}),/including archived/);
 mutate(s,editor,{op:'task.delete',board:b,id:task.id,version:task.version,confirm:true});mutate(s,editor,{op:'group.delete',board:b,id:g.id,version:g.version,confirm:true});assert.ok(!s.groups.includes(g));assert.ok(s.tasks.includes(t));
});
test('invitation backfill does not reactivate deleted or disabled people',()=>{
 const {s,admin}=setup();const i=mutate(s,admin,{op:'company.invite',email:'disabled@example.test',name:'Disabled'});i.delivery='sent';provisionInvitedPeople(s);const person=s.users.find(u=>u.email===i.email)!;person.active=false;person.deleted=true;
 s.members.push({id:'legacy-pending',board:'board-1',pendingEmail:person.email,role:'Edit'});provisionInvitedPeople(s);assert.equal(person.active,false);assert.equal(s.members.find(m=>m.id==='legacy-pending')!.user,undefined);
});
test('independent board permissions and Directors privacy',()=>{const {s,viewer,manager,admin}=setup();assert.equal(role(s,viewer,'board-1'),1);assert.equal(role(s,viewer,'board-3'),2);assert.equal(role(s,viewer,'board-0'),0);assert.equal(view(s,viewer).boards.length,5);assert.equal(view(s,admin).boards.length,8);denied(()=>mutate(s,manager,{op:'board.create',name:'Forbidden'}));denied(()=>mutate(s,manager,{op:'user',id:manager.id,admin:true}));});
test('Directors members inherit board permissions and are assignable everywhere without system administration',()=>{
 const {s,admin,editor,viewer,t,b}=setup();s.members=s.members.filter(m=>m.user!==editor.id);mutate(s,admin,{op:'member',board:'board-0',user:editor.id,role:'Edit'});
 assert.ok(s.boards.every(board=>role(s,editor,board.id)===2));assert.equal(view(s,editor).tasks.length,s.tasks.length);denied(()=>mutate(s,editor,{op:'user',id:viewer.id,admin:true}));
 const snapshot=view(s,viewer);assert.ok(snapshot.users.some((u:any)=>u.id===editor.id));assert.ok(snapshot.members.some((m:any)=>m.board===b&&m.user===editor.id&&m.inherited));assert.ok(!snapshot.boards.some((x:any)=>x.id==='board-0'));
 update(s,admin,t,{assignee:editor.id,team:[editor.id]});const child=mutate(s,admin,{op:'task.create',board:b,parent:t.id,title:'Directors subtask'});update(s,admin,child,{assignee:editor.id,team:[editor.id]});
 const newBoard=mutate(s,admin,{op:'board.create',name:'New board'});assert.equal(role(s,editor,newBoard.id),2);
 mutate(s,admin,{op:'member',board:b,user:editor.id,role:'Manage'});assert.equal(role(s,editor,b),3);mutate(s,admin,{op:'member',board:'board-0',user:editor.id,role:null});assert.equal(role(s,editor,newBoard.id),0);assert.equal(role(s,editor,b),3);
});
test('pending Directors invitees can be assigned across boards but cannot access work before acceptance',()=>{
 const {s,admin,editor,t,b}=setup();const i=mutate(s,admin,{op:'company.invite',email:'director@example.test',name:'Invited Director'});mutate(s,admin,{op:'member',board:'board-0',email:i.email,role:'View'});const person=s.users.find(u=>u.email===i.email)!;
 update(s,editor,t,{assignee:person.id,team:[person.id]});assert.ok(view(s,editor).members.some((m:any)=>m.board===b&&m.user===person.id));assert.equal(role(s,person,b),0);
 mutate(s,person,{op:'invite.accept',token:i.token});assert.equal(role(s,person,b),1);assert.equal(view(s,person).boards.length,s.boards.length);denied(()=>update(s,person,t,{title:'No editing'}));
 mutate(s,admin,{op:'user',id:person.id,active:false});assert.equal(role(s,person,b),0);
});
test('View can create groups but not tasks',()=>{const {s,viewer,b,g}=setup();mutate(s,viewer,{op:'group.create',board:b,name:'Viewer group'});denied(()=>mutate(s,viewer,{op:'task.create',board:b,group:g,title:'No'}));});
test('View may change own status and remark only',()=>{const {s,viewer,t}=setup();update(s,viewer,t,{remark:'My update',status:'pending'});assert.equal(t.remark,'My update');for(const changes of [{title:'No'},{assignee:'demo-edit'},{start:'2026-01-01'},{team:[]},{priority:'High'}])denied(()=>update(s,viewer,t,changes));denied(()=>update(s,viewer,s.tasks[1],{status:'wip'}));});
test('Supporting membership does not confer View editing',()=>{const {s,viewer,t}=setup();t.assignee='demo-edit';t.team=[viewer.id];denied(()=>update(s,viewer,t,{remark:'No'}));});
test('Editor creates one subtask level, with separate ownership',()=>{const {s,editor,t}=setup();const child=mutate(s,editor,{op:'task.create',board:t.board,parent:t.id,title:'Child'});update(s,editor,child,{assignee:'demo-view',team:['demo-edit','demo-manage']});assert.equal(child.assignee,'demo-view');assert.throws(()=>mutate(s,editor,{op:'task.create',board:t.board,parent:child.id,title:'Grandchild'}),/one subtask/);});
test('dates and active member constraints enforced',()=>{const {s,editor,t}=setup();assert.throws(()=>update(s,editor,t,{start:'2026-04-03',due:'2026-04-02'}),/precede/);assert.throws(()=>update(s,editor,t,{assignee:'not-a-member'}),/active board member/);});
test('revision conflicts preserve another user’s saved changes',()=>{const {s,editor,t}=setup();const v=t.version;update(s,editor,t,{remark:'First saved'});assert.throws(()=>mutate(s,editor,{op:'task.update',board:t.board,id:t.id,version:v,changes:{remark:'Stale'}}),/record changed/);assert.equal(t.remark,'First saved');});
test('custom schema management is Manage only and preserves archived values',()=>{const {s,editor,manager,b,t}=setup();const board=s.boards.find(x=>x.id===b)!;denied(()=>mutate(s,editor,{op:'settings',board:b,version:board.version,columns:[]}));const c={id:'custom',name:'Channel',type:'single-select',options:['Social','Email'],archived:false};mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[c]});update(s,editor,t,{custom:{custom:'Email'}});mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[{...c,archived:true}]});assert.equal(t.custom.custom,'Email');assert.throws(()=>mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[]}),/Confirm column deletion/);});
test('status renaming retains completion classification and used deletion needs replacement',()=>{const {s,manager,b}=setup();const board=s.boards.find(x=>x.id===b)!;const done=s.tasks.find(t=>t.status==='completed')!;const statuses=structuredClone(board.statuses);statuses.find((x:any)=>x.id==='completed').name='Done';mutate(s,manager,{op:'settings',board:b,version:board.version,statuses});assert.ok(completed(s,done));assert.throws(()=>mutate(s,manager,{op:'settings',board:b,version:board.version,statuses:statuses.filter((x:any)=>x.id!=='pending')}),/replacement/);});
test('chat counts count human messages and replies; file count does not inflate',()=>{const {s,viewer,t}=setup();const n=s.messages.length;const parent=mutate(s,viewer,{op:'chat.post',board:t.board,subject:t.id,body:'Hello',mentions:[]});for(const id of ['f1','f2'])s.files.push({id,board:t.board,subject:t.id,user:viewer.id});mutate(s,viewer,{op:'chat.post',board:t.board,subject:t.id,body:'Two files',reply:parent.id,files:['f1','f2']});assert.equal(s.messages.length,n+2);mutate(s,viewer,{op:'chat.read',board:t.board,subject:t.id});assert.equal(s.reads.find(r=>r.user===viewer.id)?.last,s.messages.at(-1)?.id);});
test('mention/reply notifications deduplicate and exclude sender',()=>{const {s,viewer,editor,t}=setup();mutate(s,viewer,{op:'chat.post',board:t.board,subject:t.id,body:'Review',mentions:[editor.id,editor.id,viewer.id]});assert.equal(s.notifications.filter(n=>n.user===editor.id).length,1);assert.equal(s.notifications.filter(n=>n.user===viewer.id).length,0);});
test('assignments notify new primary and supporting recipients once',()=>{const {s,admin,editor,t}=setup();update(s,admin,t,{assignee:editor.id,team:[editor.id]});assert.equal(s.notifications.filter(n=>n.user===editor.id).length,1);});
test('revocation removes every board child from authorised snapshot',()=>{const {s,manager,viewer,t,b}=setup();s.notifications.push({id:'secret-note',board:b,user:viewer.id,text:'Secret',subject:t.id});s.files.push({id:'secret-file',board:b,subject:t.id});mutate(s,manager,{op:'member',board:b,user:viewer.id,role:null});const v=view(s,viewer);for(const kind of ['boards','tasks','groups','topics','messages','files','notifications','activity'])assert.equal(v[kind].filter((r:any)=>r.board===b||r.id===b).length,0);assert.equal(t.assignee,viewer.id);denied(()=>update(s,viewer,t,{remark:'No'}));});
test('company invitation email binding, expiry, resend and acceptance',()=>{const {s,admin,viewer}=setup();const i=mutate(s,admin,{op:'company.invite',email:'new@example.test',name:'New Person',mobile:'+65 1234'});assert.throws(()=>mutate(s,viewer,{op:'invite.accept',token:i.token}),/email/);const person={id:'new-user',email:i.email,name:'Google Name',active:true,onboarding:true};s.users.push(person);i.expires='2000-01-01';assert.throws(()=>mutate(s,person,{op:'invite.accept',token:i.token}),/unavailable/);const token=i.token;mutate(s,admin,{op:'invite.update',id:i.id});assert.notEqual(i.token,token);mutate(s,person,{op:'invite.accept',token:i.token});assert.equal(i.state,'accepted');assert.equal(person.name,'New Person');assert.equal((person as any).mobile,'+65 1234');});
test('parent completion warns and does not complete children',()=>{const {s,editor,t}=setup();const child=s.tasks.find(x=>x.parent===t.id)!;child.status='not-started';assert.throws(()=>update(s,editor,t,{status:'completed'}),/unfinished subtasks/);update(s,editor,t,{status:'completed'},{confirmIncomplete:true});assert.equal(child.status,'not-started');update(s,editor,t,{status:'wip'});assert.equal(t.completedAt,null);});
test('Singapore date boundary and due-today calculations',()=>{const {s,t}=setup();assert.equal(today(new Date('2026-09-14T16:01:00Z')),'2026-09-15');t.due='2026-09-15';assert.equal(overdue(s,t,'2026-09-15'),false);assert.equal(overdue(s,t,'2026-09-16'),true);t.due='';assert.equal(overdue(s,t,'2026-09-16'),false);});
test('dependency self links, cycles and cross-board links rejected; warning never blocks status',()=>{const {s,editor,t}=setup();const second=s.tasks[1];assert.throws(()=>update(s,editor,t,{depends:[t.id]}),/itself/);assert.throws(()=>update(s,editor,t,{depends:[second.id]}),/cycle/);update(s,editor,second,{status:'completed'});assert.equal(second.status,'completed');const other={...structuredClone(t),id:'other',board:'board-3'};s.tasks.push(other);assert.throws(()=>update(s,editor,t,{depends:[other.id]}),/same board/);});
test('archiving retains subtasks, messages and dependency warnings; restoration resumes access',()=>{const {s,manager,viewer,t}=setup();const child=s.tasks.find(x=>x.parent===t.id)!;const messages=s.messages.length;update(s,manager,t,{archived:true});assert.ok(archived(s,child));assert.equal(s.messages.length,messages);assert.throws(()=>mutate(s,viewer,{op:'chat.post',board:t.board,subject:t.id,body:'No'}),/Restore/);update(s,manager,t,{archived:false});assert.equal(archived(s,child),false);});
test('monthly schedules clamp February and return to original day',()=>{const {s,editor,t}=setup();mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,frequency:'monthly',start:'2026-01-31',day:31,offset:2});assert.equal(runRecurrences(s,'2026-03-31'),3);const dates=s.tasks.filter(x=>x.occurrence&&!x.parent).map(x=>x.start);assert.deepEqual(dates,['2026-01-31','2026-02-28','2026-03-31']);assert.equal(runRecurrences(s,'2026-03-31'),0);});
test('weekly downtime recovery, clean independent occurrences, child dependency remapping',()=>{const {s,editor,t}=setup();const c=s.tasks.find(x=>x.parent===t.id)!;c.depends=[t.id];mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,frequency:'weekly',start:'2026-09-01',day:2,offset:3});assert.equal(runRecurrences(s,'2026-09-15'),3);const children=s.tasks.filter(x=>x.occurrence&&x.parent);assert.equal(children.length,3);for(const child of children){assert.deepEqual(child.depends,[child.parent]);assert.equal(child.remark,'');assert.equal(child.status,'not-started');}assert.equal(runRecurrences(s,'2026-09-15'),0);});
test('paused recurrence skips dates and end stops generation',()=>{const {s,editor,t}=setup();mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,frequency:'monthly',start:'2026-01-01',day:1,offset:0});mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,action:'pause'});assert.equal(runRecurrences(s,'2026-06-01'),0);mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,action:'resume'});const r=s.recurrences[0];assert.equal(r.cursor,today());mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,action:'end'});assert.equal(runRecurrences(s,'2027-06-01'),0);});
test('inactive accounts denied and last active administrator protected',()=>{const {s,admin,viewer}=setup();assert.throws(()=>mutate(s,admin,{op:'user',id:admin.id,admin:false}),/Keep an active administrator/);mutate(s,admin,{op:'user',id:viewer.id,active:false});denied(()=>view(s,viewer));});
test('board managers add accepted members but cannot send company invitations',()=>{const {s,manager,viewer,b}=setup();mutate(s,manager,{op:'member',board:b,user:viewer.id,role:null});mutate(s,manager,{op:'member',board:b,user:viewer.id,role:'Edit'});assert.equal(role(s,viewer,b),2);denied(()=>mutate(s,manager,{op:'company.invite',name:'Person',email:'other@example.test'}));assert.throws(()=>mutate(s,manager,{op:'invite',board:b,email:'other@example.test',role:'View'}),/Administration/);});
test('archived discussions may update read position without allowing new messages',()=>{const {s,manager,viewer,t}=setup();update(s,manager,t,{archived:true});mutate(s,viewer,{op:'chat.read',board:t.board,subject:t.id});assert.ok(s.reads.some(r=>r.subject===t.id&&r.user===viewer.id));});
test('large recurrence catch-up advances in bounded retry-safe batches',()=>{const {s,editor,t}=setup();mutate(s,editor,{op:'recurrence',board:t.board,id:t.id,frequency:'weekly',start:'2025-01-01',day:3,offset:0});assert.equal(runRecurrences(s,'2025-12-31'),20);assert.equal(runRecurrences(s,'2025-12-31'),20);assert.equal(runRecurrences(s,'2025-12-31'),13);assert.equal(runRecurrences(s,'2025-12-31'),0);});
test('one company invitation activates multiple board assignments and preserves removals',()=>{
 const {s,admin,manager,b}=setup();const email='pending@example.test';const i=mutate(s,admin,{op:'company.invite',email,name:'Pending Person'});
 assert.throws(()=>mutate(s,admin,{op:'company.invite',email:email.toUpperCase(),name:'Duplicate'}),/already has an invitation/);
 mutate(s,manager,{op:'member',board:b,email,role:'Edit'});mutate(s,admin,{op:'member',board:'board-0',email,role:'View'});mutate(s,admin,{op:'member',board:'board-2',email,role:'Manage'});
 mutate(s,admin,{op:'member',board:'board-2',email,role:null});assert.equal(i.state,'pending');assert.equal(s.invites.filter(x=>x.email===email).length,1);
 const person=s.users.find(u=>u.email===email)!;assert.equal(role(s,person,b),0);
 mutate(s,person,{op:'invite.accept',token:i.token});assert.equal(role(s,person,b),2);assert.equal(role(s,person,'board-0'),1);assert.equal(role(s,person,'board-2'),1);
});
test('cancelling company invitation removes pending assignments and keeps private contacts out of manager snapshots',()=>{
 const {s,admin,manager,viewer,b}=setup();const i=mutate(s,admin,{op:'company.invite',email:'cancel@example.test',name:'Cancel Person',mobile:'123456'});
 mutate(s,manager,{op:'member',board:b,email:i.email,role:'View'});assert.ok(view(s,manager).directory.some((p:any)=>p.email===i.email));assert.equal(view(s,viewer).directory.length,0);
 assert.ok(!JSON.stringify(view(s,manager)).includes('123456'));mutate(s,admin,{op:'invite.update',id:i.id,cancel:true});assert.equal(s.members.filter(m=>m.pendingEmail===i.email).length,0);
 assert.throws(()=>mutate(s,manager,{op:'member',board:b,email:i.email,role:'View'}),/Choose an accepted/);
});
test('administrators edit short names and mobile numbers across invitations and accounts',()=>{
 const {s,admin,manager,viewer}=setup();const i={id:'details-invite',email:viewer.email,name:'Old',mobile:'111',state:'accepted'};s.invites.push(i);
 denied(()=>mutate(s,manager,{op:'person.edit',kind:'users',id:viewer.id,name:'No',mobile:''}));
 mutate(s,admin,{op:'person.edit',kind:'users',id:viewer.id,name:'  Short Name  ',mobile:'+65 1234'});
 assert.equal(viewer.name,'Short Name');assert.equal(i.name,'Short Name');assert.equal(viewer.mobile,'+65 1234');
 mutate(s,admin,{op:'person.edit',kind:'invites',id:i.id,name:'Short',mobile:''});assert.equal(viewer.mobile,'');
 assert.throws(()=>mutate(s,admin,{op:'person.edit',kind:'users',id:viewer.id,name:' ',mobile:''}),/Person Name/);
});
test('invitation removal invalidates pending links without removing accepted membership',()=>{
 const {s,admin,manager,viewer,b}=setup();const i=mutate(s,admin,{op:'company.invite',name:'Pending',email:'remove@example.test'});
 mutate(s,manager,{op:'member',board:b,email:i.email,role:'View'});denied(()=>mutate(s,manager,{op:'invite.remove',id:i.id}));
 mutate(s,admin,{op:'invite.remove',id:i.id});assert.ok(!s.invites.some(x=>x.id===i.id));assert.ok(!s.members.some(x=>x.pendingEmail===i.email));
 assert.throws(()=>mutate(s,viewer,{op:'invite.accept',token:i.token}),/unavailable/);
 const accepted={id:'accepted-record',email:viewer.email,state:'accepted'};s.invites.push(accepted);const before=role(s,viewer,b);
 mutate(s,admin,{op:'invite.remove',id:accepted.id});assert.equal(role(s,viewer,b),before);
});
test('deleting a portal user revokes access while preserving history and blocks reactivation',()=>{
 const {s,admin,manager,viewer,b,t}=setup();denied(()=>mutate(s,manager,{op:'user.delete',id:viewer.id}));
 assert.throws(()=>mutate(s,admin,{op:'user.delete',id:admin.id}),/yourself/);
 s.invites.push({id:'delete-invite',email:viewer.email,state:'pending'});const tasks=s.tasks.length;mutate(s,admin,{op:'user.delete',id:viewer.id});
 assert.equal(viewer.deleted,true);assert.equal(role(s,viewer,b),0);assert.equal(s.tasks.length,tasks);assert.equal(t.assignee,viewer.id);
 assert.ok(!s.members.some(m=>m.user===viewer.id));assert.ok(!s.invites.some(i=>i.email===viewer.email));assert.ok(!view(s,admin).directory.some((p:any)=>p.email===viewer.email));
 assert.throws(()=>mutate(s,admin,{op:'user',id:viewer.id,active:true}),/deleted/);
});
test('existing board names migrate once without replacing custom names or records',()=>{
 const {s}=setup();s.boards[2].name='CRM (Customer Relationship Manager)';s.boards[3].name='Ops';s.boards[5].name='Technology Department';const tasks=s.tasks.length;
 assert.equal(updateBoardNames(s),true);assert.equal(s.boards[2].name,'Customer Relationship');assert.equal(s.boards[3].name,'Operations');assert.equal(s.boards[5].name,'Technology');assert.equal(s.tasks.length,tasks);assert.equal(updateBoardNames(s),false);
 s.boards[3].name='Custom Operations';assert.equal(updateBoardNames(s),false);
});
test('new shared columns persist and default unchecked while the five standard columns are checked',()=>{
 const {s,manager,viewer,b}=setup();const board=s.boards.find(x=>x.id===b)!;const column={id:'shared-col',name:'Tracking',type:'text',archived:false};
 mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[...board.columns,column]});assert.ok(board.hidden.includes(column.id));
 assert.ok(view(s,viewer).boards.find((x:any)=>x.id===b).columns.some((c:any)=>c.id===column.id));
 assert.equal(standardColumns.length,8);for(const id of standardColumns)assert.ok(!columnPreferences(board,null).includes(id));
 assert.ok(columnPreferences(board,{hidden:[],known:[]}).includes(column.id));assert.ok(!columnPreferences(board,{hidden:[],known:[column.id]}).includes(column.id));
 mutate(s,manager,{op:'settings',board:b,version:board.version,hidden:[]});assert.ok(!board.hidden.includes(column.id));
});
test('a task supports many sibling subtasks without a fixed count limit',()=>{
 const {s,editor,t,b}=setup();for(let n=0;n<200;n++)mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Subtask '+n});
 assert.ok(s.tasks.filter(x=>x.parent===t.id).length>=200);
});
test('person name and abbreviation remain independent and transfer on acceptance',()=>{
 const {s,admin}=setup();const i=mutate(s,admin,{op:'company.invite',email:'abbr@example.test',name:'Full Person Name',abbreviation:'FPN',mobile:''});
 const u={id:'abbr-user',email:i.email,name:'Google Name',abbreviation:'GN',active:true,onboarding:true};s.users.push(u);mutate(s,u,{op:'invite.accept',token:i.token});
 assert.equal(u.name,'Full Person Name');assert.equal(u.abbreviation,'FPN');mutate(s,admin,{op:'person.edit',kind:'users',id:u.id,name:'New Full Name',abbreviation:'NF',mobile:''});assert.equal(u.name,'New Full Name');assert.equal(u.abbreviation,'NF');
});
test('new tasks and subtasks start without inherited dates',()=>{
 const {s,editor,t,b,g}=setup();t.start='2026-09-15';t.due='2026-09-20';const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Dated child'});assert.equal(child.start,'');assert.equal(child.due,'');
 const task=mutate(s,editor,{op:'task.create',board:b,group:g,title:'New'});assert.equal(task.start,'');assert.equal(task.due,'');
});
test('list reordering persists and moving a parent to a group carries its subtasks',()=>{
 const {s,editor,t,b,g}=setup();const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});const next=mutate(s,editor,{op:'task.create',board:b,group:g,title:'Next'});
 mutate(s,editor,{op:'task.move',board:b,id:next.id,version:next.version,target:t.id,after:false});assert.ok(next.order<t.order);
 const group=mutate(s,editor,{op:'group.create',board:b,name:'Destination'});mutate(s,editor,{op:'task.move',board:b,id:t.id,version:t.version,group:group.id});assert.equal(t.group,group.id);assert.equal(child.group,group.id);
});
test('subtasks can move beside siblings under another parent but cannot change board or level',()=>{
 const {s,editor,t,b,g}=setup();const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});const parent=mutate(s,editor,{op:'task.create',board:b,group:g,title:'Parent 2'});const other=mutate(s,editor,{op:'task.create',board:b,parent:parent.id,title:'Other child'});
 assert.throws(()=>mutate(s,editor,{op:'task.move',board:b,id:child.id,version:child.version,target:parent.id}),/beside/);
 mutate(s,editor,{op:'task.move',board:b,id:child.id,version:child.version,target:other.id});assert.equal(child.parent,parent.id);assert.ok(child.order<other.order);
});
test('deletion requires confirmation, blocks parents with subtasks and denies viewers',()=>{
 const {s,editor,viewer,t,b}=setup();const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});const count=s.tasks.filter(x=>x.parent===t.id).length;
 denied(()=>mutate(s,viewer,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true,childCount:count}));
 assert.throws(()=>mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version}),/Confirm/);
 assert.throws(()=>mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true}),/Delete or move all subtasks/);
 child.archived=true;assert.throws(()=>mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true}),/Delete or move all subtasks/);assert.ok(s.tasks.includes(t)&&s.tasks.includes(child));
 s.files.push({id:'attachment-delete',board:b,subject:child.id,removed:false});mutate(s,editor,{op:'task.delete',board:b,id:child.id,version:child.version,confirm:true});assert.ok(s.tasks.includes(t));assert.ok(!s.tasks.includes(child));assert.equal(s.files.find(f=>f.id==='attachment-delete')!.removed,true);
 for(const sibling of s.tasks.filter(x=>x.parent===t.id))mutate(s,editor,{op:'task.delete',board:b,id:sibling.id,version:sibling.version,confirm:true});mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true});assert.ok(!s.tasks.includes(t));
});
test('archived tasks can be restored without rewriting other task fields',()=>{
 const {s,manager,viewer,t,b}=setup();t.archived=true;const due=t.due;denied(()=>mutate(s,viewer,{op:'task.restore',board:b,id:t.id,version:t.version}));mutate(s,manager,{op:'task.restore',board:b,id:t.id,version:t.version});assert.equal(t.archived,false);assert.equal(t.due,due);
});
test('board column order persists for standard and custom columns and rejects invalid orders',()=>{
 const {s,manager,viewer,b}=setup();const board=s.boards.find(x=>x.id===b)!;board.columns.push({id:'extra',name:'Extra',type:'text'});const order=moveColumn(columnOrder(board),'extra','assignee');
 mutate(s,manager,{op:'settings',board:b,version:board.version,columnOrder:order});assert.deepEqual(columnOrder(board),order);assert.ok(order.indexOf('extra')<order.indexOf('assignee'));
 denied(()=>mutate(s,viewer,{op:'settings',board:b,version:board.version,columnOrder:order}));assert.throws(()=>mutate(s,manager,{op:'settings',board:b,version:board.version,columnOrder:['bad']}),/Invalid column order/);
 board.columns=[];assert.ok(!columnOrder(board).includes('extra'));board.columns.push({id:'new',name:'New',type:'text'});assert.equal(columnOrder(board).at(-1),'new');
});
test('task emails require editing access and only include assigned members with task-specific links',()=>{
 const {s,editor,viewer,t,b}=setup();update(s,editor,t,{assignee:editor.id,team:[viewer.id]});const p={id:t.id,version:t.version,recipients:[editor.id,viewer.id,viewer.id]};
 const emails=taskEmail(s,editor,p,'https://connect.aspireone.ai');assert.equal(emails.length,2);assert.ok(emails[0].text.includes('task='+t.id));assert.deepEqual(emails[0].to,[editor.email]);
 denied(()=>taskEmail(s,viewer,p,'https://connect.aspireone.ai'));assert.throws(()=>taskEmail(s,editor,{...p,recipients:['not-assigned']},'https://connect.aspireone.ai'),/Select assigned/);assert.throws(()=>taskEmail(s,editor,{...p,version:0},'https://connect.aspireone.ai'),/latest task/);
 const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Email subtask'});update(s,editor,child,{team:[viewer.id]});assert.match(taskEmail(s,editor,{id:child.id,version:child.version,recipients:[viewer.id]},'https://connect.aspireone.ai')[0].subject,/Subtask invitation/);
 t.archived=true;assert.throws(()=>taskEmail(s,editor,p,'https://connect.aspireone.ai'),/Restore/);
});

test('role board grants combine permissions, revoke immediately and never activate pending people',()=>{
 const {s,admin,viewer}=setup();viewer.roles=['Finance','HR'];s.members=s.members.filter(m=>m.user!==viewer.id);const b=s.boards.find(b=>b.id==='board-5')!;
 mutate(s,admin,{op:'board.roles',board:b.id,version:b.version,grants:{Finance:'View',HR:'Edit'}});
 assert.equal(role(s,viewer,b.id),2);assert.ok(view(s,viewer).members.some((m:any)=>m.board===b.id&&m.user===viewer.id));
 viewer.onboarding=true;assert.equal(role(s,viewer,b.id),0);viewer.onboarding=false;
 mutate(s,admin,{op:'board.roles',board:b.id,version:b.version,grants:{}});assert.equal(role(s,viewer,b.id),0);
 assert.throws(()=>mutate(s,viewer,{op:'board.roles',board:b.id,version:b.version,grants:{Finance:'Manage'}}));
});
test('article audience protects content metadata and discussions; author and manager permissions differ',()=>{
 const {s,admin,viewer,editor,manager}=setup();view(s,admin);const board=s.boards.find(b=>b.id==='knowledge-learning')!;
 for(const [u,r] of [[viewer,'View'],[editor,'Edit'],[manager,'Manage']] as any[]){s.members.push({id:'a-'+u.id,board:board.id,user:u.id,role:r});}
 s.files.push({id:'html',board:board.id,user:editor.id,articleContent:true});
 const a=mutate(s,editor,{op:'article.save',board:board.id,title:'Finance report',description:'Quarterly',publishDate:'2026-09-23',tags:['Finance'],audience:['Finance'],content:'html'});
 assert.equal(view(s,viewer).articles.length,0);assert.equal(view(s,manager).articles.length,1);
 assert.throws(()=>mutate(s,viewer,{op:'chat.post',board:board.id,subject:a.id,body:'private'}));
 viewer.roles=['Finance'];assert.equal(view(s,viewer).articles.length,1);mutate(s,viewer,{op:'chat.post',board:board.id,subject:a.id,body:'Question'});
 viewer.roles=[];assert.equal(view(s,viewer).messages.filter((m:any)=>m.subject===a.id).length,0);
 assert.throws(()=>mutate(s,editor,{op:'article.pin',board:board.id,id:a.id,version:a.version,pinned:true}));
 mutate(s,manager,{op:'article.pin',board:board.id,id:a.id,version:a.version,pinned:true});assert.equal(a.pinned,true);
 assert.throws(()=>mutate(s,manager,{op:'article.save',board:board.id,id:a.id,version:a.version,title:'Changed'}));
 mutate(s,manager,{op:'article.delete',board:board.id,id:a.id,version:a.version,confirm:true});assert.equal(view(s,editor).articles.length,0);
 assert.throws(()=>mutate(s,editor,{op:'chat.post',board:board.id,subject:a.id,body:'Deleted'}));
});
test('only system admins can assign roles; removal revokes role access',()=>{
 const {s,viewer,admin}=setup();s.members=s.members.filter(m=>m.user!==viewer.id);const b=s.boards.find(b=>b.id==='board-5')!;
 mutate(s,admin,{op:'board.roles',board:b.id,version:b.version,grants:{Manager:'Manage'}});
 assert.throws(()=>mutate(s,viewer,{op:'roles.request',roles:['Manager','Finance']}));assert.equal(role(s,viewer,b.id),0);
 assert.throws(()=>mutate(s,viewer,{op:'roles.assign',user:viewer.id,roles:['Manager']}));
 mutate(s,admin,{op:'roles.assign',user:viewer.id,roles:['Manager','Finance']});assert.equal(role(s,viewer,b.id),3);assert.equal(viewer.requestedRoles,undefined);
 mutate(s,admin,{op:'roles.assign',user:viewer.id,roles:[]});assert.equal(role(s,viewer,b.id),0);
});
test('PDF articles retain their type and reject another author’s uploaded content',()=>{
 const {s,admin,editor}=setup();view(s,admin);const board=s.boards.find(b=>b.id==='knowledge-learning')!;
 s.members.push({id:'pdf-member',board:board.id,user:editor.id,role:'Edit'});
 s.files.push({id:'pdf',board:board.id,user:editor.id,articleContent:true,type:'application/pdf'});
 const p={op:'article.save',board:board.id,title:'Report',description:'',publishDate:'2026-09-23',tags:[],audience:['Finance'],content:'pdf'};
 assert.throws(()=>mutate(s,admin,p));
 const a=mutate(s,editor,p);assert.equal(a.contentType,'application/pdf');assert.equal(a.author,editor.id);
 assert.throws(()=>mutate(s,editor,{...p,id:a.id,version:a.version,tags:['a','b','c','d']}));
});
test('invitation and person details carry admin-selected roles through acceptance',()=>{
 const {s,admin,viewer}=setup();const i=mutate(s,admin,{op:'company.invite',name:'New colleague',email:'roles@example.test',roles:['Senior Manager','Marketing']});i.delivery='sent';provisionInvitedPeople(s);const person=s.users.find(u=>u.email===i.email)!;
 assert.deepEqual(person.roles,['Senior Manager','Marketing']);mutate(s,person,{op:'invite.accept',token:i.token});assert.deepEqual(person.roles,['Senior Manager','Marketing']);
 mutate(s,admin,{op:'person.edit',kind:'users',id:person.id,name:person.name,roles:['Director']});assert.deepEqual(person.roles,['Director']);assert.deepEqual(i.roles,['Director']);
 assert.throws(()=>mutate(s,viewer,{op:'person.edit',kind:'users',id:viewer.id,name:viewer.name,roles:['Director']}));
});
test('Directors always read article boards and every article includes selected roles and attachment metadata',()=>{
 const {s,admin,viewer}=setup();view(s,admin);viewer.roles=['Director'];s.members=s.members.filter(m=>m.user!==viewer.id);const board=s.boards.find(b=>b.id==='knowledge-strategies')!;
 s.files.push({id:'image',board:board.id,user:admin.id,articleContent:true,type:'image/png',name:'Chart.png'},{id:'video',board:board.id,user:admin.id,articleContent:true,type:'video/mp4',name:'Review.mp4'});
 const p={op:'article.save',board:board.id,title:'Report',description:'',publishDate:'2026-09-23',tags:[],audience:['Finance'],content:'image',attachments:['image','video']};
 const a=mutate(s,admin,p);assert.deepEqual(a.audience,['Director','Finance']);assert.equal(view(s,viewer).articles.length,1);assert.equal(role(s,viewer,board.id),1);assert.equal(a.attachmentInfo[1].name,'Review.mp4');
 assert.throws(()=>mutate(s,admin,{...p,audience:'all'}));viewer.roles=[];assert.equal(view(s,viewer).articles.length,0);
});
test('article ordering is manager-only and stays within the pinned or ordinary section',()=>{
 const {s,admin,editor}=setup();view(s,admin);const board=s.boards.find(b=>b.id==='knowledge-learning')!;s.members.push({id:'order-editor',board:board.id,user:editor.id,role:'Edit'});
 const base={board:board.id,author:admin.id,publishDate:'2026-09-23',createdAt:'2026-09-23T00:00:00Z',version:1,audience:['Director']};s.articles.push({...base,id:'first',order:0},{...base,id:'second',order:1},{...base,id:'pinned',pinned:true,order:0});
 assert.throws(()=>mutate(s,editor,{op:'article.move',board:board.id,id:'second',version:1,direction:'up'}));
 mutate(s,admin,{op:'article.move',board:board.id,id:'second',version:1,direction:'up'});assert.equal(s.articles.find(a=>a.id==='second')!.order,0);assert.equal(s.articles.find(a=>a.id==='first')!.order,1);assert.equal(s.articles.find(a=>a.id==='pinned')!.order,0);
 assert.throws(()=>mutate(s,admin,{op:'article.move',board:board.id,id:'second',version:1,direction:'down'}));
 assert.throws(()=>mutate(s,admin,{op:'article.move',board:board.id,id:'pinned',version:1,direction:'down'}));
});
test('Managers can edit article metadata while preserving the author and attachments',()=>{
 const {s,admin,editor,viewer}=setup();view(s,admin);const board=s.boards.find(b=>b.id==='knowledge-learning')!;s.members.push({id:'edit-owner',board:board.id,user:editor.id,role:'Edit'});
 s.files.push({id:'owned',board:board.id,user:editor.id,articleContent:true,type:'application/pdf'});
 const p={op:'article.save',board:board.id,title:'Original',description:'Before',publishDate:'2026-09-23',tags:[],audience:['Finance'],content:'owned',attachments:['owned']};
 const a=mutate(s,editor,p);mutate(s,admin,{...p,id:a.id,version:a.version,description:'After',audience:['Marketing']});assert.equal(a.description,'After');assert.equal(a.author,editor.id);assert.ok(a.audience.includes('Marketing'));
 assert.throws(()=>mutate(s,viewer,{...p,id:a.id,version:a.version}));
 s.files.push({id:'replacement',board:board.id,user:admin.id,articleContent:true});assert.throws(()=>mutate(s,admin,{...p,id:a.id,version:a.version,content:'replacement',attachments:['replacement']}));
});
