import {State,uid} from './model';

// Board membership can be prepared before email delivery reporting catches up.
// Pending identities remain unable to access boards until invitation acceptance.
export function provisionInvitedPeople(s:State){
 let changed=false;
 for(const invite of s.invites){
  const hasMembership=s.members.some(m=>m.pendingEmail===invite.email);
  if(invite.state!=='pending'||(!hasMembership&&invite.delivery!==undefined&&invite.delivery!=='sent'))continue;
  let person=s.users.find(u=>u.email===invite.email);
  if(!person){
   const name=invite.name||invite.email;
   person={id:uid(),email:invite.email,name,mobile:invite.mobile||'',abbreviation:invite.abbreviation||name.split(' ').map((x:string)=>x[0]).join('').slice(0,4),active:true,admin:false,onboarding:true};
   s.users.push(person);changed=true;
  }
  if(!person.active||person.deleted)continue;
  for(const membership of s.members.filter(m=>m.pendingEmail===invite.email))if(membership.user!==person.id){membership.user=person.id;changed=true;}
 }
 return changed;
}
