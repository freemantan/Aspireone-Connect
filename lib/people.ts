import {businessRoles,ensureKnowledge} from './business-roles';
import {canReadArticle,articleOperation} from './articles';
import {State,Row,check,find,role,uid,now,audit,legacyMutate,legacyView,boardMemberships} from './model';
import {taskOperation} from './task-operations';
import {provisionInvitedPeople} from './invited-people';
const emailOf=(value:any)=>{check(typeof value==='string'&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim()),'Valid email required',400);return value.trim().toLowerCase();};
const pending=(s:State,email:string)=>s.invites.find(i=>i.email===email&&i.state==='pending');
export function directory(s:State){
 const people=new Map<string,Row>();
 for(const u of s.users)if(u.active&&!u.onboarding)people.set(u.email,{id:u.email,email:u.email,name:u.name,user:u.id,status:'Accepted'});
 for(const i of s.invites)if(i.state==='pending'&&!people.has(i.email))people.set(i.email,{id:i.email,email:i.email,name:i.name||i.email,status:i.expires>now()?'Pending invitation':'Invitation expired'});
 return [...people.values()];
}
export function workspaceView(s:State,u:Row){
 // The legacy projection still supports already-sent board invitation links.
 ensureKnowledge(s);
 const v=legacyView({...s,invites:s.invites.filter(i=>i.board)},u);
 v.members=v.boards.flatMap((b:Row)=>boardMemberships(s,b.id));
 const managers=u.admin||s.boards.some(b=>role(s,u,b.id)>=3);
 v.directory=managers?directory(s):[];
 v.invites=u.admin?s.invites.map(({token,...i})=>i):[];
 v.pendingInvitations.push(...s.invites.filter(i=>!i.board&&i.email===u.email&&i.state==='pending'&&i.expires>now()).map(i=>({id:i.id,token:i.token,boardName:'AspireOne Connect',role:'Company member',expires:i.expires})));
 if(!u.admin){v.users=v.users.map(({mobile,...person}:Row)=>person);if(v.me.id===u.id)v.me.mobile=u.mobile;}
 v.businessRoles=businessRoles;
 v.articles=(s.articles||[]).filter(a=>canReadArticle(s,u,a));
 for(const a of v.articles){if(!v.users.some((x:Row)=>x.id===a.author)){const author=s.users.find(x=>x.id===a.author);if(author)v.users.push({id:author.id,name:author.name,abbreviation:author.abbreviation,active:author.active});}}
 const articleIds=new Set((s.articles||[]).map(a=>a.id)),visible=new Set(v.articles.map((a:Row)=>a.id));
 for(const key of ['messages','files','reads','notifications','activity'])v[key]=v[key].filter((r:Row)=>!articleIds.has(r.subject)||visible.has(r.subject));
 v.files=v.files.filter((f:Row)=>!f.articleContent);
 return v;
}
function activateAssignments(s:State,u:Row){
 for(const m of s.members.filter(m=>m.pendingEmail===u.email)){
  s.members=s.members.filter(other=>other===m||!(other.board===m.board&&other.user===u.id));
  m.user=u.id;delete m.pendingEmail;
 }
}
export function workspaceMutate(s:State,u:Row,p:any):any{
 check(u.active);ensureKnowledge(s);
 if(p.op?.startsWith('article.'))return articleOperation(s,u,p);
 if(p.op==='roles.assign'){
  check(u.admin);
  check(Array.isArray(p.roles)&&p.roles.every((r:string)=>businessRoles.includes(r))&&new Set(p.roles).size===p.roles.length,'Choose valid roles',400);
  const person=find(s,'users',p.user);check(!person.deleted,'User unavailable',404);
  person.roles=p.roles;delete person.requestedRoles;
  audit(s,u,'',person.id,p.op==='roles.assign'?'Roles assigned':'Roles requested',null,p.roles);return;
 }
 if(p.op==='board.roles'){
  const b=find(s,'boards',p.board);check(role(s,u,b.id)>=3);check(!b.archived);check(p.version===b.version,'Board changed. Refresh and retry.',409);
  check(p.grants&&typeof p.grants==='object'&&!Array.isArray(p.grants)&&Object.entries(p.grants).every(([r,a])=>businessRoles.includes(r)&&['View','Edit','Manage'].includes(String(a))),'Invalid role access',400);
  b.roleAccess=p.grants;b.version++;audit(s,u,b.id,b.id,'Role access updated',null,p.grants);return b;
 }
 if(p.op==='group.move'){
  const group=find(s,'groups',p.id),target=find(s,'groups',p.target);
  check(group.board===p.board&&target.board===group.board,'Move groups within the same board',400);check(role(s,u,group.board)>=2);
  check(!find(s,'boards',group.board).archived&&!group.archived&&!target.archived,'Restore archived work before moving groups',400);
  check(group.version===p.version,'This group changed. Refresh before continuing.',409);
  if(group.id===target.id)return;
  const groups=s.groups.filter(g=>g.board===group.board&&g.id!==group.id).sort((a,b)=>a.order-b.order);
  groups.splice(groups.findIndex(g=>g.id===target.id)+(p.after?1:0),0,group);
  groups.forEach((g,index)=>{if(g.order!==index){g.order=index;g.version++;}});
  audit(s,u,group.board,group.id,'Group moved',null,{order:group.order});return;
 }
 if(p.op==='group.delete'){
  const group=find(s,'groups',p.id);check(group.board===p.board);check(role(s,u,group.board)>=2);
  check(!find(s,'boards',group.board).archived,'Restore the board first',400);
  check(group.version===p.version,'This group changed. Refresh before continuing.',409);
  check(p.confirm===true,'Confirm group deletion first',400);
  check(!s.tasks.some(t=>t.group===group.id),'Move or delete all tasks, including archived tasks, before deleting this group.',400);
  s.groups=s.groups.filter(g=>g.id!==group.id);audit(s,u,group.board,group.id,'Group deleted',{name:group.name},null);return;
 }
 if(['task.move','task.delete','task.restore'].includes(p.op))return taskOperation(s,u,p);
 if(p.op==='settings'&&Array.isArray(p.columns)&&p.hidden===undefined){
  const board=find(s,'boards',p.board);p={...p,hidden:[...(board.hidden||[]),...p.columns.filter((c:Row)=>!board.columns.some((old:Row)=>old.id===c.id)).map((c:Row)=>c.id)]};
 }
 if(p.op==='person.edit'){
  check(u.admin);check(['users','invites'].includes(p.kind),'Invalid person type',400);
  const person=find(s,p.kind,p.id);check(!person.deleted,'User has been deleted',400);
  if(p.roles!==undefined)check(Array.isArray(p.roles)&&p.roles.every((r:string)=>businessRoles.includes(r)),'Invalid roles',400);
  const name=typeof p.name==='string'?p.name.trim():'',mobile=typeof p.mobile==='string'?p.mobile.trim():'';
  check(name&&name.length<=150,'Person Name is required (up to 150 characters)',400);check(mobile.length<=40,'Mobile number is too long',400);
  for(const row of [...s.users,...s.invites].filter(x=>x.email===person.email)){row.name=name;row.mobile=mobile;if(p.roles!==undefined)row.roles=[...new Set(p.roles)];if(p.abbreviation!==undefined){check(typeof p.abbreviation==='string'&&p.abbreviation.trim().length<=12,'Abbr Name must be up to 12 characters',400);row.abbreviation=p.abbreviation.trim();}}
  audit(s,u,'',person.id,'Person details updated',null,null);return;
 }
 if(p.op==='invite.remove'){
  check(u.admin);const i=find(s,'invites',p.id);s.invites=s.invites.filter(x=>x.id!==i.id);
  if(i.state!=='accepted'&&!pending(s,i.email))s.members=s.members.filter(m=>m.pendingEmail!==i.email);
  audit(s,u,'',i.id,'Invitation removed',null,i.email);return;
 }
 if(p.op==='user.delete'){
  check(u.admin);const person=find(s,'users',p.id);check(person.id!==u.id,'You cannot delete yourself',400);
  check(!person.admin||!person.active||s.users.some(x=>x.id!==person.id&&x.admin&&x.active&&!x.deleted),'Keep an active administrator',400);
  person.active=false;person.admin=false;person.deleted=true;person.deletedAt=now();person.mobile='';
  s.members=s.members.filter(m=>m.user!==person.id&&m.pendingEmail!==person.email);
  s.invites=s.invites.filter(i=>i.email!==person.email);
  audit(s,u,'',person.id,'User deleted',null,person.email);return;
 }
 if(p.op==='user')check(!find(s,'users',p.id).deleted,'User has been deleted',400);
 if(p.op==='company.invite'){
  check(u.admin);const email=emailOf(p.email),name=typeof p.name==='string'?p.name.trim():'';
  check(name&&name.length<=150,'Person Name is required (up to 150 characters)',400);
  check(p.roles===undefined||Array.isArray(p.roles)&&p.roles.every((r:string)=>businessRoles.includes(r)),'Invalid roles',400);
  const mobile=typeof p.mobile==='string'?p.mobile.trim():'';check(mobile.length<=40,'Mobile number is too long',400);
  check(!s.users.some(x=>x.email===email&&(!x.onboarding||!x.active||x.deleted)),'This person already has an account. Add them from Board Members.',400);
  check(!pending(s,email),'This person already has an invitation. Use Resend in Administration.',400);
  check(p.abbreviation===undefined||(typeof p.abbreviation==='string'&&p.abbreviation.trim().length<=12),'Abbr Name must be up to 12 characters',400);const i={id:uid(),email,name,mobile,roles:p.roles||[],abbreviation:p.abbreviation?.trim()||'',token:uid()+uid(),expires:new Date(Date.now()+7*86400000).toISOString(),state:'pending',delivery:'queued',inviter:u.id,at:now()};
  s.invites.push(i);audit(s,u,'',i.id,'Company invitation created',null,email);return i;
 }
 if(p.op==='invite.update'){
  check(u.admin);const i=find(s,'invites',p.id);check(i.state!=='accepted','Invitation already accepted',400);
  if(p.cancel){i.state='cancelled';s.members=s.members.filter(m=>m.pendingEmail!==i.email);}
  else{check(!s.users.some(x=>x.email===i.email&&x.active&&!x.onboarding),'This person already has an account',400);i.state='pending';i.token=uid()+uid();i.expires=new Date(Date.now()+7*86400000).toISOString();i.delivery='queued';}
  return i;
 }
 if(p.op==='invite') {check(false,'Send company invitations from Administration.',400);}
 if(p.op==='invite.accept'){
  const i=s.invites.find(i=>i.token===p.token);check(i&&i.email===u.email&&i.state==='pending'&&i.expires>now(),'Invitation unavailable or email does not match',403);
  if(i.board){const board=legacyMutate(s,u,p);u.onboarding=false;activateAssignments(s,u);return board;}
  i.state='accepted';u.onboarding=false;u.name=i.name||u.name;u.mobile=i.mobile||'';if(i.roles)u.roles=i.roles;if(i.abbreviation)u.abbreviation=i.abbreviation;activateAssignments(s,u);audit(s,u,'',i.id,'Company invitation accepted',null,u.email);
  return s.members.find(m=>m.user===u.id&&!find(s,'boards',m.board).archived)?.board||'';
 }
 if(p.op==='member'){
  const board=find(s,'boards',p.board);check(role(s,u,board.id)>=3);check(!board.archived,'Restore the board before making changes',400);
  const email=p.email?emailOf(p.email):find(s,'users',p.user).email;
  const person=s.users.find(x=>x.email===email),invite=pending(s,email);
  if(p.role){check(['View','Edit','Manage'].includes(p.role),'Invalid role',400);check((person&&person.active&&!person.onboarding)||invite,'Choose an accepted or invited company member',400);check(!person||person.active,'Account is inactive',400);}
  const matches=(m:Row)=>m.board===board.id&&(m.pendingEmail===email||(person&&m.user===person.id));
  const prev=s.members.find(matches);s.members=s.members.filter(m=>!matches(m));
  // Removing access also invalidates legacy board-specific links for this board.
  if(!p.role)for(const i of s.invites.filter(i=>i.board===board.id&&i.email===email&&i.state==='pending'))i.state='cancelled';
  if(p.role){const awaiting=invite&&!s.invites.some(i=>i.email===email&&i.state==='accepted');s.members.push({id:uid(),board:board.id,...(person&&!awaiting?{user:person.id}:{pendingEmail:email}),role:p.role});provisionInvitedPeople(s);}
  audit(s,u,board.id,person?.id||email,'Membership changed',prev,p.role||'Removed');return;
 }
 return legacyMutate(s,u,p);
}
