import {State,Row,check,find,role,uid,now,audit,legacyMutate,legacyView} from './model';
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
 const v=legacyView({...s,invites:s.invites.filter(i=>i.board)},u);
 const managers=u.admin||s.boards.some(b=>role(s,u,b.id)>=3);
 v.directory=managers?directory(s):[];
 v.invites=u.admin?s.invites.map(({token,...i})=>i):[];
 v.pendingInvitations.push(...s.invites.filter(i=>!i.board&&i.email===u.email&&i.state==='pending'&&i.expires>now()).map(i=>({id:i.id,token:i.token,boardName:'AspireOne Connect',role:'Company member',expires:i.expires})));
 if(!u.admin){v.users=v.users.map(({mobile,...person}:Row)=>person);if(v.me.id===u.id)v.me.mobile=u.mobile;}
 return v;
}
function activateAssignments(s:State,u:Row){
 for(const m of s.members.filter(m=>m.pendingEmail===u.email)){
  s.members=s.members.filter(other=>other===m||!(other.board===m.board&&other.user===u.id));
  m.user=u.id;delete m.pendingEmail;
 }
}
export function workspaceMutate(s:State,u:Row,p:any):any{
 check(u.active);
 if(['task.move','task.delete','task.restore'].includes(p.op))return taskOperation(s,u,p);
 if(p.op==='settings'&&Array.isArray(p.columns)&&p.hidden===undefined){
  const board=find(s,'boards',p.board);p={...p,hidden:[...(board.hidden||[]),...p.columns.filter((c:Row)=>!board.columns.some((old:Row)=>old.id===c.id)).map((c:Row)=>c.id)]};
 }
 if(p.op==='person.edit'){
  check(u.admin);check(['users','invites'].includes(p.kind),'Invalid person type',400);
  const person=find(s,p.kind,p.id);check(!person.deleted,'User has been deleted',400);
  const name=typeof p.name==='string'?p.name.trim():'',mobile=typeof p.mobile==='string'?p.mobile.trim():'';
  check(name&&name.length<=150,'Person Name is required (up to 150 characters)',400);check(mobile.length<=40,'Mobile number is too long',400);
  for(const row of [...s.users,...s.invites].filter(x=>x.email===person.email)){row.name=name;row.mobile=mobile;if(p.abbreviation!==undefined){check(typeof p.abbreviation==='string'&&p.abbreviation.trim().length<=12,'Abbr Name must be up to 12 characters',400);row.abbreviation=p.abbreviation.trim();}}
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
  const mobile=typeof p.mobile==='string'?p.mobile.trim():'';check(mobile.length<=40,'Mobile number is too long',400);
  check(!s.users.some(x=>x.email===email&&(!x.onboarding||!x.active||x.deleted)),'This person already has an account. Add them from Board Members.',400);
  check(!pending(s,email),'This person already has an invitation. Use Resend in Administration.',400);
  check(p.abbreviation===undefined||(typeof p.abbreviation==='string'&&p.abbreviation.trim().length<=12),'Abbr Name must be up to 12 characters',400);const i={id:uid(),email,name,mobile,abbreviation:p.abbreviation?.trim()||'',token:uid()+uid(),expires:new Date(Date.now()+7*86400000).toISOString(),state:'pending',delivery:'queued',inviter:u.id,at:now()};
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
  i.state='accepted';u.onboarding=false;u.name=i.name||u.name;u.mobile=i.mobile||'';if(i.abbreviation)u.abbreviation=i.abbreviation;activateAssignments(s,u);audit(s,u,'',i.id,'Company invitation accepted',null,u.email);
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
