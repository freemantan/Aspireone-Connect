import {compareArticles} from './article-order';
import {State,Row,check,find,role,uid,now,audit} from './model';
import {businessRoles} from './business-roles';
export function canReadArticle(s:State,u:Row,a:Row){return !a.deleted&&role(s,u,a.board)>0&&(role(s,u,a.board)>=3||(u.roles||[]).includes('Director')||a.author===u.id||a.audience==='all'||(a.audience||[]).some((r:string)=>(u.roles||[]).includes(r)));}
export function articleOperation(s:State,u:Row,p:any){
 const board=find(s,'boards',p.board);check(board.kind==='articles'&&!board.archived,'Article board unavailable',404);
 const level=role(s,u,board.id);check(level>=2);
 const a=p.id?find(s,'articles',p.id):null;
 if(a){check(a.board===board.id&&canReadArticle(s,u,a),'Article unavailable',404);check(a.version===p.version,'Article changed. Reopen it before saving.',409);}
 if(p.op==='article.move'){
  check(a&&level>=3,'Manager access required');check(['up','down'].includes(p.direction),'Invalid direction',400);
  const rows=s.articles.filter(x=>x.board===board.id&&!x.deleted&&!!x.pinned===!!a.pinned).sort(compareArticles),index=rows.findIndex(x=>x.id===a.id),target=index+(p.direction==='up'?-1:1);
  check(target>=0&&target<rows.length,'Article is already at the end of this section',400);
  [rows[index],rows[target]]=[rows[target],rows[index]];rows.forEach((x,i)=>{if(x.order!==i){x.order=i;x.version++;}});audit(s,u,board.id,a.id,'Article moved',null,p.direction);return;
 }
 if(p.op==='article.delete'){check(a&&u.admin===true,'Only system administrators can remove articles',403);check(p.confirm===true,'Confirm deletion',400);a.deleted=true;a.version++;audit(s,u,board.id,a.id,'Article deleted',null,null);return;}
 if(p.op==='article.pin'){check(a&&level>=3,'Manager access required');a.pinned=!!p.pinned;a.version++;return a;}
 check(p.op==='article.save','Unknown article action',400);check(!a||a.author===u.id||level>=3,'Only the author or a Manager can edit article details');
 const title=typeof p.title==='string'?p.title.trim():'',description=typeof p.description==='string'?p.description.trim():'';
 check(title&&title.length<=200,'Title is required (up to 200 characters)',400);check(description.length<=1500,'Description is too long',400);
 check(Array.isArray(p.tags)&&p.tags.length<=3&&p.tags.every((t:any)=>typeof t==='string'&&t.trim()&&t.length<=40),'Use up to three tags (40 characters each)',400);
 check(p.audience==='all'||Array.isArray(p.audience)&&p.audience.length>0&&p.audience.every((r:string)=>businessRoles.includes(r)),'Choose All or at least one role',400);
 check(typeof p.publishDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.publishDate)&&Number.isFinite(Date.parse(p.publishDate))&&new Date(p.publishDate).toISOString().slice(0,10)===p.publishDate,'Valid publication date required',400);
 const attachmentIds=p.attachments||[p.content];if(a&&a.author!==u.id)check(JSON.stringify(attachmentIds)===JSON.stringify(a.attachments||[a.content])&&p.content===a.content,'Only the author can replace article attachments',403);check(Array.isArray(attachmentIds)&&attachmentIds.length>0&&attachmentIds.length<=50,'Attach between 1 and 50 files',400);for(const id of attachmentIds){const attachment=find(s,'files',id);check(attachment.articleContent&&attachment.board===board.id&&(attachment.user===u.id||!!a&&(a.attachments||[a.content]).includes(id))&&!attachment.removed,'Invalid article attachment',400);}
 const f=find(s,'files',p.content||attachmentIds[0]);check(attachmentIds.includes(f.id),'Main content must be an attachment',400);check(f.articleContent&&f.board===board.id&&(f.user===u.id||!!a&&(a.attachments||[a.content]).includes(f.id))&&!f.removed,'Upload article content first',400);
 const article=a||{id:uid(),board:board.id,author:u.id,createdAt:now(),version:0,pinned:false};
 if(p.pinned!==undefined&&!!p.pinned!==!!article.pinned)check(level>=3,'Only Managers can change Always on Top');
 Object.assign(article,{title,description,publishDate:p.publishDate,tags:[...new Set(p.tags.map((t:string)=>t.trim()))],audience:p.audience==='all'?'all':[...new Set(['Director',...p.audience])],attachments:attachmentIds,attachmentInfo:attachmentIds.map((id:string)=>{const f=find(s,'files',id);return {id:f.id,name:f.name,type:f.type};}),content:f.id,contentType:f.type||'text/html',updatedAt:now(),version:article.version+1});
 if(level>=3&&p.pinned!==undefined)article.pinned=!!p.pinned;
 if(!a)s.articles.push(article);audit(s,u,board.id,article.id,a?'Article updated':'Article published',null,null);return article;
}
