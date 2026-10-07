import {initialiseLearning} from './learning';
import {initialiseNoticeBoard} from './notice-board';
import type {State,Row} from './model';
export const businessRoles=['Business Manager','Subject Head','Customer Relationship','Marketing','HR','Technology','Finance','Online Business','AHCI','Manager','Senior Manager','Franchisee','Director','Shareholder'];
export const roleLabel=(role:string)=>role==='HR'?'Human Resource':role;
export const roleLabels=(roles:string[])=>businessRoles.filter(role=>roles.includes(role)).map(roleLabel).join(', ');
import {accessLevel} from './access';
export {accessLevel} from './access';
export function roleAccess(s:State,u:Row,board:string){
 const grants=s.boards.find(b=>b.id===board)?.roleAccess||{};
 return Math.max(board.startsWith('knowledge-')&&(u.roles||[]).includes('Director')?1:0,...(u.roles||[]).map((r:string)=>accessLevel(grants[r])));
}
export const knowledgeBoards=[{id:'knowledge-strategies',name:'Notice Board'},{id:'knowledge-learning',name:'Learning'}];
export function ensureKnowledge(s:State){
 let changed=false;
 if(!s.articles){s.articles=[];changed=true;}
 for(const b of knowledgeBoards)if(!s.boards.some(x=>x.id===b.id)){s.boards.push({...b,kind:'articles',statuses:[],columns:[],hidden:[],archived:false,version:1,roleAccess:{}});changed=true;}
 const noticesChanged=initialiseNoticeBoard(s);const learningChanged=initialiseLearning(s);return noticesChanged||learningChanged||changed;
}
