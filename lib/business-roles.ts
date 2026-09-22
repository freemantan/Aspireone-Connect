import type {State,Row} from './model';
export const businessRoles=['Shareholder','Director','Franchisee','Business Manager','Subject Head','Customer Relationship','Finance','HR','Manager','Senior Manager','Marketing'];
export const accessLevel=(value:string)=>({View:1,Edit:2,Manage:3}[value as 'View']||0);
export function roleAccess(s:State,u:Row,board:string){
 const grants=s.boards.find(b=>b.id===board)?.roleAccess||{};
 return Math.max(board.startsWith('knowledge-')&&(u.roles||[]).includes('Director')?1:0,...(u.roles||[]).map((r:string)=>accessLevel(grants[r])));
}
export const knowledgeBoards=[{id:'knowledge-strategies',name:'BI & Strategies'},{id:'knowledge-learning',name:'Info & Learning'}];
export function ensureKnowledge(s:State){
 let changed=false;
 if(!s.articles){s.articles=[];changed=true;}
 for(const b of knowledgeBoards)if(!s.boards.some(x=>x.id===b.id)){s.boards.push({...b,kind:'articles',statuses:[],columns:[],hidden:[],archived:false,version:1,roleAccess:{}});changed=true;}
 return changed;
}
