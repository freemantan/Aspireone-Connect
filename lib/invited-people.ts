import {State,uid} from './model';

// Board membership can be prepared before email delivery reporting catches up.
// Pending identities remain unable to access boards until invitation acceptance.
export function provisionInvitedPeople(s:State){
 let changed=false;
 const pendingByEmail=new Map(s.invites.filter(i=>i.state==='pending').map(i=>[i.email,i]));
 for(const invite of pendingByEmail.values()){
  let person=s.users.find(u=>u.email===invite.email);
  if(!person){
   const name=invite.name||invite.email;
   person={id:uid(),email:invite.email,name,mobile:invite.mobile||'',abbreviation:invite.abbreviation||name.split(' ').map((x:string)=>x[0]).join('').slice(0,4),memberGroupId:invite.memberGroupId||'',roles:invite.roles||[],active:true,admin:false,onboarding:true};
   s.users.push(person);changed=true;
  }
  if(!person.active||person.deleted)continue;
  if(person.onboarding){
   for(const key of ['name','mobile','abbreviation','roles','memberGroupId'])if(invite[key]!==undefined&&JSON.stringify(person[key])!==JSON.stringify(invite[key])){person[key]=Array.isArray(invite[key])?[...invite[key]]:invite[key];changed=true;}
  }
  for(const membership of s.members.filter(m=>m.pendingEmail===invite.email))if(membership.user!==person.id){membership.user=person.id;changed=true;}
 }
 return changed;
}
