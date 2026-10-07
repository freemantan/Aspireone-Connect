import {learningBoardId} from './learning';
import {noticeBoardId,noticeCategories,noticeGroups,noticeGroupAccess,noticeArticleLevel,articleNoticeGroups,articleCategory,defaultNoticeCategory,defaultNoticeGroup,canPublishByRole,isActivePerson,explicitArticleReader,configuredNoticeAccess} from './notice-board';
import {compareArticles} from './article-order';
import {State,Row,check,find,uid,now,audit} from './model';
import {businessRoles,roleAccess,accessLevel} from './business-roles';
export function articleBoardLevel(s:State,u:Row,board:string){
 if(!isActivePerson(u))return 0;if(u.admin)return 4;if(board===learningBoardId)return 2;
 return Math.max(accessLevel(s.members.find(m=>m.board===board&&m.user===u.id)?.role),accessLevel(s.members.find(m=>m.board==='board-0'&&m.user===u.id)?.role),roleAccess(s,u,board),roleAccess(s,u,'board-0'));
}
export function articleLevel(s:State,u:Row,a:Row){return a.board===noticeBoardId?noticeArticleLevel(s.boards.find(b=>b.id===a.board),u,a):articleBoardLevel(s,u,a.board);}
export function canReadArticle(s:State,u:Row,a:Row){
 if(!isActivePerson(u)||a.deleted)return false;
 if(u.admin||a.board===learningBoardId||explicitArticleReader(u,a))return true;
 if(a.board===noticeBoardId&&a.legacyNoticeAccess&&configuredNoticeAccess(a.legacyNoticeAccess,u)===0)return false;
 const level=articleLevel(s,u,a);
 return level>0&&(level>=2.5||a.audience==='all'||(u.roles||[]).includes('Director')||(a.audience||[]).some((r:string)=>(u.roles||[]).includes(r)));
}
export function canPublishArticle(s:State,u:Row,board:Row,groups:string[]=[]){
 if(!isActivePerson(u)||board.kind!=='articles'||board.archived)return false;
 if(canPublishByRole(u))return true;
 return board.id===noticeBoardId?Array.isArray(groups)&&groups.length>0&&groups.every(g=>noticeGroupAccess(board,u,g)>=2):articleBoardLevel(s,u,board.id)>=2;
}
export function articleOperation(s:State,u:Row,p:any){
 check(isActivePerson(u));const board=find(s,'boards',p.board);check(board.kind==='articles'&&!board.archived,'Article board unavailable',404);
 const a=p.id?find(s,'articles',p.id):null;
 if(a){check(a.board===board.id&&canReadArticle(s,u,a),'Article unavailable',404);check(a.version===p.version,'Article changed. Reopen it before saving.',409);}
 const learning=board.id===learningBoardId;
 const category=p.category??a?.category??(board.id===noticeBoardId?defaultNoticeCategory:'');
 const groups=p.noticeGroups??(a?articleNoticeGroups(a):[defaultNoticeGroup]);
 const level=a?articleLevel(s,u,a):board.id===noticeBoardId?Math.max(0,...(Array.isArray(groups)?groups:[]).map((g:string)=>noticeGroupAccess(board,u,g))):articleBoardLevel(s,u,board.id);
 if(p.op==='article.delete'){check(a&&(u.admin||a.author===u.id||level>=2.5),'Only the author, an Editor or a Manager can remove this article',403);check(p.confirm===true,'Confirm deletion',400);a.deleted=true;a.version++;audit(s,u,board.id,a.id,'Article deleted',null,null);return;}
 if(p.op==='article.move'){
  check(a&&level>=3,'Manager access required');check(['up','down'].includes(p.direction),'Invalid direction',400);
  if(board.id===noticeBoardId)check(noticeGroups.includes(p.group)&&articleNoticeGroups(a).includes(p.group)&&noticeGroupAccess(board,u,p.group)>=3,'Choose a managed Notice Group',400);
  const rows=s.articles.filter(x=>x.board===board.id&&!x.deleted&&(board.id!==noticeBoardId||articleNoticeGroups(x).includes(p.group)&&(!p.branch||x.branch===p.branch))&&!!x.pinned===!!a.pinned).sort(compareArticles),index=rows.findIndex(x=>x.id===a.id),target=index+(p.direction==='up'?-1:1);
  check(target>=0&&target<rows.length,'Article is already at the end of this section',400);
  [rows[index],rows[target]]=[rows[target],rows[index]];rows.forEach((x,i)=>{if(x.order!==i){x.order=i;x.version++;}});audit(s,u,board.id,a.id,'Article moved',null,p.direction);return;
 }
 if(p.op==='article.pin'){check(a&&level>=3,'Manager access required');a.pinned=!!p.pinned;a.version++;return a;}
 check(p.op==='article.save','Unknown article action',400);
 check(a?a.author===u.id||level>=2.5:canPublishArticle(s,u,board,groups),'Publishing permission or article ownership required');
 if(board.id===noticeBoardId){
  check(Array.isArray(groups)&&groups.length>0&&groups.every((g:any)=>noticeGroups.includes(g)),'Select at least one Notice Group',400);
  const added=a?groups.filter((g:string)=>!articleNoticeGroups(a).includes(g)):groups;
  check(!added.length||canPublishArticle(s,u,board,added),'Publishing permission required in the selected Notice Groups');
 }
 check(learning?typeof category==='string'&&category.trim().length>0&&category.trim().length<=80:category===''&&board.id!==noticeBoardId||noticeCategories.includes(category),'Choose a category (up to 80 characters)',400);
 if(learning){p.audience='all';p.individualAccess=[];}
 const needsBranch=board.id===noticeBoardId&&(groups.includes('Branch')||category==='Branch');
 if(needsBranch)check(typeof p.branch==='string'&&(s.branches||[]).some(b=>b.id===p.branch),'Choose a branch',400);
 if(a&&!u.admin&&Array.isArray(a.audience)&&a.audience.includes('Director'))check(p.audience==='all'||Array.isArray(p.audience)&&p.audience.includes('Director'),'Director access cannot be unselected');
 const title=typeof p.title==='string'?p.title.trim():'',description=typeof p.description==='string'?p.description.trim():'';
 check(title&&title.length<=200,'Title is required (up to 200 characters)',400);check(description.length<=1500,'Description is too long',400);
 check(Array.isArray(p.tags)&&p.tags.length<=3&&p.tags.every((t:any)=>typeof t==='string'&&t.trim()&&t.length<=40),'Use up to three tags (40 characters each)',400);
 const individuals=p.individualAccess??a?.individualAccess??[];
 check(Array.isArray(individuals)&&individuals.every((id:any)=>typeof id==='string'&&s.users.some(x=>x.id===id&&!x.deleted&&(x.active&&!x.onboarding||(a?.individualAccess||[]).includes(id)))),'Choose valid individual readers',400);
 check(p.audience==='all'||Array.isArray(p.audience)&&p.audience.every((r:string)=>businessRoles.includes(r))&&(p.audience.length>0||individuals.length>0),'Choose All, roles or individual people',400);
 check(typeof p.publishDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.publishDate)&&Number.isFinite(Date.parse(p.publishDate))&&new Date(p.publishDate).toISOString().slice(0,10)===p.publishDate,'Valid publication date required',400);
 const attachmentIds=p.attachments||[p.content];if(a&&a.author!==u.id&&level<2.5)check(JSON.stringify(attachmentIds)===JSON.stringify(a.attachments||[a.content])&&p.content===a.content,'Only the author can replace article attachments',403);
 check(Array.isArray(attachmentIds)&&attachmentIds.length>0&&attachmentIds.length<=50,'Attach between 1 and 50 files',400);
 for(const id of attachmentIds){const attachment=find(s,'files',id);check(attachment.articleContent&&attachment.board===board.id&&(attachment.user===u.id||!!a&&(a.attachments||[a.content]).includes(id))&&!attachment.removed,'Invalid article attachment',400);}
 const f=find(s,'files',p.content||attachmentIds[0]);check(attachmentIds.includes(f.id),'Main content must be an attachment',400);
 const article=a||{id:uid(),board:board.id,author:u.id,createdAt:now(),version:0,pinned:false,order:Math.min(0,...s.articles.filter(x=>x.board===board.id&&!x.deleted).map(x=>typeof x.order==='number'?x.order:0))-1};
 if(p.pinned!==undefined&&!!p.pinned!==!!article.pinned)check(level>=3,'Only Managers can change Always on Top');
 Object.assign(article,{title,description,category:category.trim(),publishDate:p.publishDate,tags:[...new Set(p.tags.map((t:string)=>t.trim()))],individualAccess:[...new Set(individuals)],audience:p.audience==='all'?'all':[...new Set(p.audience)],attachments:attachmentIds,attachmentInfo:attachmentIds.map((id:string)=>{const file=find(s,'files',id);return {id:file.id,name:file.name,type:file.type};}),content:f.id,contentType:f.type||'text/html',updatedAt:now(),version:article.version+1});
 if(board.id===noticeBoardId){Object.assign(article,{noticeGroups:[...new Set(groups)],branch:needsBranch?p.branch:''});if(p.retainLegacyAccess===false)delete article.legacyNoticeAccess;}
 if(level>=3&&p.pinned!==undefined)article.pinned=!!p.pinned;
 if(learning){board.learningCategories=[...new Set([...(board.learningCategories||[]),article.category])].sort();board.version++;}
 if(!a)s.articles.push(article);audit(s,u,board.id,article.id,a?'Article updated':'Article published',null,null);return article;
}
