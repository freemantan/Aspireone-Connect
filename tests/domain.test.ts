import test from 'node:test';
import assert from 'node:assert/strict';
import {initial,mutate,role,view,runRecurrences,completed,overdue,archived,today,addDays,State} from '../lib/model';
import {demo} from '../lib/demo';
import {updateBoardNames} from '../lib/workspace-updates';
import {columnPreferences,standardColumns} from '../lib/column-preferences';
function setup(){const s=initial();demo(s);const admin=s.users[0],viewer=s.users[1],editor=s.users[2],manager=s.users[3],t=s.tasks[0];return {s,admin,viewer,editor,manager,t,b:t.board,g:t.group};}
function update(s:any,u:any,t:any,changes:any,extra={}){return mutate(s,u,{op:'task.update',board:t.board,id:t.id,version:t.version,changes,...extra});}
const denied=(fn:()=>any)=>assert.throws(fn,/Access denied/);
test('production starts with six empty boards and no invented users',()=>{const s=initial();assert.equal(s.boards.length,6);assert.equal(s.users.length,0);assert.equal(s.tasks.length,0)});
test('independent board permissions and Directors privacy',()=>{const {s,viewer,manager,admin}=setup();assert.equal(role(s,viewer,'board-1'),1);assert.equal(role(s,viewer,'board-3'),2);assert.equal(role(s,viewer,'board-0'),0);assert.equal(view(s,viewer).boards.length,5);assert.equal(view(s,admin).boards.length,6);denied(()=>mutate(s,manager,{op:'board.create',name:'Forbidden'}));denied(()=>mutate(s,manager,{op:'user',id:manager.id,admin:true}));});
test('View can create groups but not tasks',()=>{const {s,viewer,b,g}=setup();mutate(s,viewer,{op:'group.create',board:b,name:'Viewer group'});denied(()=>mutate(s,viewer,{op:'task.create',board:b,group:g,title:'No'}));});
test('View may change own status and remark only',()=>{const {s,viewer,t}=setup();update(s,viewer,t,{remark:'My update',status:'pending'});assert.equal(t.remark,'My update');for(const changes of [{title:'No'},{assignee:'demo-edit'},{start:'2026-01-01'},{team:[]},{priority:'High'}])denied(()=>update(s,viewer,t,changes));denied(()=>update(s,viewer,s.tasks[1],{status:'wip'}));});
test('Supporting membership does not confer View editing',()=>{const {s,viewer,t}=setup();t.assignee='demo-edit';t.team=[viewer.id];denied(()=>update(s,viewer,t,{remark:'No'}));});
test('Editor creates one subtask level, with separate ownership',()=>{const {s,editor,t}=setup();const child=mutate(s,editor,{op:'task.create',board:t.board,parent:t.id,title:'Child'});update(s,editor,child,{assignee:'demo-view',team:['demo-edit','demo-manage']});assert.equal(child.assignee,'demo-view');assert.throws(()=>mutate(s,editor,{op:'task.create',board:t.board,parent:child.id,title:'Grandchild'}),/one subtask/);});
test('dates and active member constraints enforced',()=>{const {s,editor,t}=setup();assert.throws(()=>update(s,editor,t,{start:'2026-04-03',due:'2026-04-02'}),/precede/);assert.throws(()=>update(s,editor,t,{assignee:'not-a-member'}),/active board member/);});
test('revision conflicts preserve another user’s saved changes',()=>{const {s,editor,t}=setup();const v=t.version;update(s,editor,t,{remark:'First saved'});assert.throws(()=>mutate(s,editor,{op:'task.update',board:t.board,id:t.id,version:v,changes:{remark:'Stale'}}),/record changed/);assert.equal(t.remark,'First saved');});
test('custom schema management is Manage only and preserves archived values',()=>{const {s,editor,manager,b,t}=setup();const board=s.boards.find(x=>x.id===b)!;denied(()=>mutate(s,editor,{op:'settings',board:b,version:board.version,columns:[]}));const c={id:'custom',name:'Channel',type:'single-select',options:['Social','Email'],archived:false};mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[c]});update(s,editor,t,{custom:{custom:'Email'}});mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[{...c,archived:true}]});assert.equal(t.custom.custom,'Email');assert.throws(()=>mutate(s,manager,{op:'settings',board:b,version:board.version,columns:[]}),/Archive custom/);});
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
 const person={id:'pending-person',email,name:'Google name',active:true,onboarding:true};s.users.push(person);assert.equal(role(s,person,b),0);
 mutate(s,person,{op:'invite.accept',token:i.token});assert.equal(role(s,person,b),2);assert.equal(role(s,person,'board-0'),1);assert.equal(role(s,person,'board-2'),0);
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
 assert.equal(standardColumns.length,5);for(const id of standardColumns)assert.ok(!columnPreferences(board,null).includes(id));
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
test('subtasks inherit parent dates while top-level tasks start without dates',()=>{
 const {s,editor,t,b,g}=setup();t.start='2026-09-15';t.due='2026-09-20';const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Dated child'});assert.equal(child.start,t.start);assert.equal(child.due,t.due);
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
test('deletion requires confirmation and current child count, removes subtree and denies viewers',()=>{
 const {s,editor,viewer,t,b}=setup();const child=mutate(s,editor,{op:'task.create',board:b,parent:t.id,title:'Child'});const count=s.tasks.filter(x=>x.parent===t.id).length;
 denied(()=>mutate(s,viewer,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true,childCount:count}));
 assert.throws(()=>mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version}),/Confirm/);
 assert.throws(()=>mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true,childCount:count+1}),/Subtasks changed/);
 s.files.push({id:'attachment-delete',board:b,subject:child.id,removed:false});mutate(s,editor,{op:'task.delete',board:b,id:t.id,version:t.version,confirm:true,childCount:count});assert.ok(!s.tasks.some(x=>x.id===t.id||x.id===child.id));assert.equal(s.files.find(f=>f.id==='attachment-delete')!.removed,true);
});
test('archived tasks can be restored without rewriting other task fields',()=>{
 const {s,manager,viewer,t,b}=setup();t.archived=true;const due=t.due;denied(()=>mutate(s,viewer,{op:'task.restore',board:b,id:t.id,version:t.version}));mutate(s,manager,{op:'task.restore',board:b,id:t.id,version:t.version});assert.equal(t.archived,false);assert.equal(t.due,due);
});
