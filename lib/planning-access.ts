import {businessRoles} from './business-roles';
import type {Row} from './model';
export function canViewPlan(record:any,user:Row){
 if(!user.active||user.onboarding||user.deleted)return false;
 if(user.admin)return true;
 const members=record?.payload?.memberAccess;
 return Array.isArray(members)&&members.includes(user.id)||(user.roles||[]).some((r:string)=>businessRoles.includes(r)&&record?.payload?.roleAccess?.[r]==='View');
}
export function validateMemberAccess(value:unknown,users:Row[]){
 if(value===undefined||value===null)return [];
 if(!Array.isArray(value)||value.some(id=>typeof id!=='string'||!users.some(u=>u.id===id&&u.active&&!u.deleted)))throw Error('Choose active members for plan access');
 return [...new Set(value)];
}

export function validatePlanRoleAccess(value:unknown):Record<string,string>{
 if(value===undefined||value===null)return {};
 if(typeof value!=='object'||Array.isArray(value)||Object.entries(value).some(([role,access])=>!businessRoles.includes(role)||access!=='View'))throw Error('Choose valid plan role access');
 return {...value} as Record<string,string>;
}
