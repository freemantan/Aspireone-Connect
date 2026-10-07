import type {Row} from './model';
export function canViewPlan(record:any,user:Row){
 if(!user.active||user.onboarding||user.deleted)return false;
 if(user.admin)return true;
 const members=record?.payload?.memberAccess;
 return members==null||Array.isArray(members)&&members.includes(user.id);
}
export function validateMemberAccess(value:unknown,users:Row[]){
 if(value===undefined||value===null)return null;
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!users.some(u=>u.id===id&&u.active&&!u.deleted&&!u.onboarding)))throw Error('Choose active members for plan access');
 return [...new Set(value)];
}
