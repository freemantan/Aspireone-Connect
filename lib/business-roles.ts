import {initialiseLearning} from './learning';
import {initialiseNoticeBoard} from './notice-board';
import type {State,Row} from './model';
export const businessRoles=['Business Manager','Subject Head','Customer Relationship','Marketing','HR','Technology','Finance','Online Business','AHCI','Manager','Senior Manager','Franchisee','Director','Shareholder','System Administrator'];
export const roleLabel=(role:string)=>role==='HR'?'Human Resource':role;
export const roleLabels=(roles:string[])=>businessRoles.filter(role=>roles.includes(role)).map(roleLabel).join(', ');
import {accessLevel} from './access';
export {accessLevel} from './access';
export function roleAccess(s:State,u:Row,board:string){
 const grants=s.boards.find(b=>b.id===board)?.roleAccess||{};
 return Math.max(board.startsWith('knowledge-')&&(u.roles||[]).includes('Director')?1:0,...(u.roles||[]).filter((r:string)=>board!=='board-0'||r!=='System Administrator').map((r:string)=>accessLevel(grants[r])));
}
export const knowledgeBoards=[{id:'knowledge-strategies',name:'Notice Board'},{id:'knowledge-learning',name:'Learning'}];
export function ensureKnowledge(s:State){
 let changed=false;
 // Existing admin flag remains the authority; never elevate an account from a stored role label.
 for(const user of s.users){if(user.onboarding)continue;const current=user.roles||[];const roles=user.admin?[...new Set([...current,'System Administrator'])]:current.filter((r:string)=>r!=='System Administrator');if(JSON.stringify(roles)!==JSON.stringify(current)){user.roles=roles;changed=true;}}

 if(!s.articles){s.articles=[];changed=true;}
 for(const b of knowledgeBoards)if(!s.boards.some(x=>x.id===b.id)){s.boards.push({...b,kind:'articles',statuses:[],columns:[],hidden:[],archived:false,version:1,roleAccess:{}});changed=true;}
 // Retired category snapshots must never override current group/article grants.
 for(const article of s.articles)if(Object.hasOwn(article,'legacyNoticeAccess')){delete article.legacyNoticeAccess;article.version=(article.version||0)+1;changed=true;}
 const noticesChanged=initialiseNoticeBoard(s);const learningChanged=initialiseLearning(s);return noticesChanged||learningChanged||changed;
}
