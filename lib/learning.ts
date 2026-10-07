import type {State} from './model';
import {isActivePerson,noticeBoardId} from './notice-board';
import {accessLevel,roleAccess} from './business-roles';
export const learningBoardId='knowledge-learning';
export function initialiseLearning(s:State){
 const board=s.boards.find(b=>b.id===learningBoardId);if(!board||board.learningVersion)return false;
 for(const article of s.articles||[])if(article.board===learningBoardId){
  // Preserve the previous readers while moving the article and its discussion intact.
  const readers=s.users.filter(u=>{if(!isActivePerson(u))return false;if(u.admin||article.author===u.id||(article.individualAccess||[]).includes(u.id))return true;
   const level=Math.max(accessLevel(s.members.find(m=>m.board===learningBoardId&&m.user===u.id)?.role),accessLevel(s.members.find(m=>m.board==='board-0'&&m.user===u.id)?.role),roleAccess(s,u,learningBoardId),roleAccess(s,u,'board-0'));
   return level>0&&(level>=3||article.audience==='all'||(u.roles||[]).includes('Director')||(article.audience||[]).some((r:string)=>(u.roles||[]).includes(r)));
  });
  article.individualAccess=[...new Set([...(article.individualAccess||[]),...readers.map(u=>u.id)])];
  article.legacyNoticeAccess={members:Object.fromEntries(readers.map(u=>[u.id,'View'])),roles:{}};
  article.board=noticeBoardId;article.noticeGroups=['All Staffs'];article.category=article.category||'Strategies & Plans';article.version++;
  const files=new Set(article.attachments||[article.content]);
  for(const key of ['files','messages','reads','notifications','activity'])for(const row of s[key]||[])if(row.subject===article.id||(key==='files'&&files.has(row.id)))row.board=noticeBoardId;
 }
 board.name='Learning';board.learningVersion=1;board.version++;return true;
}
