import {State,Row,check,find,role,uid,now,audit} from './model';
import {businessRoles} from './business-roles';
export function canReadArticle(s:State,u:Row,a:Row){return !a.deleted&&role(s,u,a.board)>0&&(role(s,u,a.board)>=3||a.author===u.id||a.audience==='all'||(a.audience||[]).some((r:string)=>(u.roles||[]).includes(r)));}
export function articleOperation(s:State,u:Row,p:any){
 const board=find(s,'boards',p.board);check(board.kind==='articles'&&!board.archived,'Article board unavailable',404);
 const level=role(s,u,board.id);check(level>=2);
 const a=p.id?find(s,'articles',p.id):null;
 if(a){check(a.board===board.id&&canReadArticle(s,u,a),'Article unavailable',404);check(a.version===p.version,'Article changed. Reopen it before saving.',409);}
 if(p.op==='article.delete'){check(a&&(a.author===u.id||level>=3));check(p.confirm===true,'Confirm deletion',400);a.deleted=true;a.version++;audit(s,u,board.id,a.id,'Article deleted',null,null);return;}
 if(p.op==='article.pin'){check(a&&level>=3,'Manager access required');a.pinned=!!p.pinned;a.version++;return a;}
 check(p.op==='article.save','Unknown article action',400);check(!a||a.author===u.id,'Only the author can edit this article');
 const title=typeof p.title==='string'?p.title.trim():'',description=typeof p.description==='string'?p.description.trim():'';
 check(title&&title.length<=200,'Title is required (up to 200 characters)',400);check(description.length<=1500,'Description is too long',400);
 check(Array.isArray(p.tags)&&p.tags.length<=3&&p.tags.every((t:any)=>typeof t==='string'&&t.trim()&&t.length<=40),'Use up to three tags (40 characters each)',400);
 check(p.audience==='all'||Array.isArray(p.audience)&&p.audience.length>0&&p.audience.every((r:string)=>businessRoles.includes(r)),'Choose All or at least one role',400);
 check(typeof p.publishDate==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(p.publishDate)&&Number.isFinite(Date.parse(p.publishDate))&&new Date(p.publishDate).toISOString().slice(0,10)===p.publishDate,'Valid publication date required',400);
 const f=find(s,'files',p.content);check(f.articleContent&&f.board===board.id&&f.user===u.id&&!f.removed,'Upload article content first',400);
 const article=a||{id:uid(),board:board.id,author:u.id,createdAt:now(),version:0,pinned:false};
 if(p.pinned!==undefined&&!!p.pinned!==!!article.pinned)check(level>=3,'Only Managers can change Always on Top');
 Object.assign(article,{title,description,publishDate:p.publishDate,tags:[...new Set(p.tags.map((t:string)=>t.trim()))],audience:p.audience,content:f.id,contentType:f.type||'text/html',updatedAt:now(),version:article.version+1});
 if(level>=3&&p.pinned!==undefined)article.pinned=!!p.pinned;
 if(!a)s.articles.push(article);audit(s,u,board.id,article.id,a?'Article updated':'Article published',null,null);return article;
}
