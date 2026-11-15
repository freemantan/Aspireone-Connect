import type {State,Row} from './model';
export function personGroupIds(p:Partial<Row>):string[]{return Array.isArray(p.memberGroupIds)?[...new Set(p.memberGroupIds.filter((id:any)=>typeof id==='string'&&id))] as string[]:p.memberGroupId?[p.memberGroupId]:[];}
export const inMemberGroup=(p:Partial<Row>,id:string)=>!!id&&personGroupIds(p).includes(id);
export const groupStaffRoles=['Business Manager','Customer Relationship','Coach'];
export function managedGroupIds(s:State,u:Row):string[]{
 if(!u.active||u.deleted||u.onboarding||!(u.roles||[]).includes('Member Group Manager'))return [];
 return (s.memberGroups||[]).filter(g=>(g.managers||[]).includes(u.id)).map(g=>g.id);
}
export function managesGroup(s:State,u:Row,id?:string){return !!id&&managedGroupIds(s,u).includes(id);}
export function managesBranch(s:State,u:Row,b:Row){return !!u.admin||!!(u.active&&!u.deleted&&!u.onboarding&&(b.manager===u.id||managesGroup(s,u,b.memberGroupId)));}
export function scopedPerson(s:State,u:Row,p:Row){return !p.admin&&personGroupIds(p).some(id=>managesGroup(s,u,id))&&!(p.roles||[]).some((r:string)=>!groupStaffRoles.includes(r));}
