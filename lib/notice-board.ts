import type {State,Row} from './model';
export const noticeBoardId='knowledge-strategies';
export const noticeCategories=['Biz Intelligence','Strategies & Plans','Marketing & Sales','Finance & Budget','HR & Staff Benefit','Branch','Operations','Feedback'];
export const noticeGroups=['Business Managers','Subject Heads','Customer Relationship','Coaches','All Staffs','Branch'];
export const defaultNoticeGroup='All Staffs';
export const publishingRoles=['Manager','Business Manager','Senior Manager','Director'];
export const isActivePerson=(u:Row)=>!!u.active&&!u.onboarding&&!u.deleted;
export const canPublishByRole=(u:Row)=>isActivePerson(u)&&(!!u.admin||(u.roles||[]).some((r:string)=>publishingRoles.includes(r)));
export const explicitArticleReader=(u:Row,a:Row)=>!a.deleted&&(a.author===u.id||(a.individualAccess||[]).includes(u.id));
export const articleNoticeGroups=(a:any):string[]=>Array.isArray(a.noticeGroups)?a.noticeGroups:[a.category==='Branch'?'Branch':defaultNoticeGroup];
export const defaultNoticeCategory='Strategies & Plans';
const level=(value:string)=>({View:1,Edit:2,Manage:3}[value as 'View']||0);
export const articleCategory=(article:any)=>article.category||defaultNoticeCategory;
export function configuredNoticeAccess(config:any,user:Row){
 if(!isActivePerson(user))return 0;if(user.admin)return 4;
 return Math.max(level(config?.members?.[user.id]),level(config?.members?.[user.email]),...(user.roles||[]).map((r:string)=>level(config?.roles?.[r])));
}
export function noticeGroupAccess(board:any,user:Row,group:string){return noticeGroups.includes(group)?configuredNoticeAccess(board?.noticeGroupAccess?.[group],user):0;}
export const noticeArticleLevel=(board:any,user:Row,article:any)=>Math.max(0,...articleNoticeGroups(article).map(g=>noticeGroupAccess(board,user,g)));
export const noticeAccess=(s:State,u:Row)=>!isActivePerson(u)?0:Math.max(canPublishByRole(u)?2:0,(s.articles||[]).some(a=>a.board===noticeBoardId&&explicitArticleReader(u,a))?1:0,...noticeGroups.map(g=>noticeGroupAccess(s.boards.find(b=>b.id===noticeBoardId),u,g)));
export function initialiseNoticeBoard(s:State){
 let changed=false;for(const article of s.articles||[])if(article.category==='Operation'){article.category='Operations';article.version++;changed=true;}if(!s.branches){s.branches=[];changed=true;}
 const board=s.boards.find(b=>b.id===noticeBoardId);if(!board||board.noticeVersion>=2)return changed;
 if(!board.noticeVersion){
 const members:Record<string,string>={},roles:Record<string,string>={Director:'View'};
 const merge=(to:Record<string,string>,key:string,value:string)=>{if(key&&level(value)>level(to[key]))to[key]=value;};
 for(const m of s.members.filter(m=>[noticeBoardId,'board-0'].includes(m.board)))merge(members,m.user||m.pendingEmail,m.role);
 for(const b of s.boards.filter(b=>[noticeBoardId,'board-0'].includes(b.id)))for(const [r,a] of Object.entries(b.roleAccess||{}))merge(roles,r,String(a));
 board.name='Notice Board';board.categoryAccess=Object.fromEntries(noticeCategories.map(c=>[c,{members:{...members},roles:{...roles}}]));board.noticeVersion=1;board.version++;
 for(const a of s.articles||[])if(a.board===noticeBoardId&&!a.category){a.category=defaultNoticeCategory;a.branch='';}
 }
 const combined={members:{} as Record<string,string>,roles:{} as Record<string,string>};
 for(const config of Object.values(board.categoryAccess||{}) as any[])for(const type of ['members','roles'] as const)for(const [key,value] of Object.entries(config[type]||{}))if(level(String(value))>level(combined[type][key]))combined[type][key]=String(value);
 board.noticeGroupAccess={
  'Business Managers':{members:{},roles:{'Business Manager':'View'}},
  'Subject Heads':{members:{},roles:{'Subject Head':'View'}},
  'Customer Relationship':{members:{},roles:{'Customer Relationship':'View'}},
  'Coaches':{members:{},roles:{}},
  'All Staffs':combined,
  'Branch':structuredClone(board.categoryAccess?.Branch||{members:{},roles:{}})
 };
 for(const a of s.articles||[])if(a.board===noticeBoardId&&!a.noticeGroups){a.noticeGroups=[a.category==='Branch'?'Branch':defaultNoticeGroup];a.legacyNoticeAccess=structuredClone(board.categoryAccess?.[articleCategory(a)]||{members:{},roles:{}});}
 board.noticeVersion=2;board.version++;return true;
}
