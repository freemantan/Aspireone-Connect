import type {State,Row} from './model';
export const noticeBoardId='knowledge-strategies';
export const noticeCategories=['Biz Intelligence','Strategies & Plans','Marketing & Sales','Finance & Budget','HR & Staff Benefit','Branch'];
export const defaultNoticeCategory='Strategies & Plans';
const level=(value:string)=>({View:1,Edit:2,Manage:3}[value as 'View']||0);
export const articleCategory=(article:any)=>article.category||defaultNoticeCategory;
export function noticeCategoryAccess(board:any,user:Row,category:string){
 if(!user.active||user.onboarding||user.deleted||!noticeCategories.includes(category))return 0;
 if(user.admin)return 4;
 const access=board?.categoryAccess?.[category];
 return Math.max(level(access?.members?.[user.id]),level(access?.members?.[user.email]),...(user.roles||[]).map((r:string)=>level(access?.roles?.[r])));
}
export const noticeAccess=(s:State,u:Row)=>Math.max(0,...noticeCategories.map(c=>noticeCategoryAccess(s.boards.find(b=>b.id===noticeBoardId),u,c)));
export function initialiseNoticeBoard(s:State){
 let changed=false;if(!s.branches){s.branches=[];changed=true;}
 const board=s.boards.find(b=>b.id===noticeBoardId);if(!board||board.noticeVersion)return changed;
 const members:Record<string,string>={},roles:Record<string,string>={Director:'View'};
 const merge=(to:Record<string,string>,key:string,value:string)=>{if(key&&level(value)>level(to[key]))to[key]=value;};
 for(const m of s.members.filter(m=>[noticeBoardId,'board-0'].includes(m.board)))merge(members,m.user||m.pendingEmail,m.role);
 for(const b of s.boards.filter(b=>[noticeBoardId,'board-0'].includes(b.id)))for(const [r,a] of Object.entries(b.roleAccess||{}))merge(roles,r,String(a));
 board.name='Notice Board';board.categoryAccess=Object.fromEntries(noticeCategories.map(c=>[c,{members:{...members},roles:{...roles}}]));board.noticeVersion=1;board.version++;
 for(const a of s.articles||[])if(a.board===noticeBoardId&&!a.category){a.category=defaultNoticeCategory;a.branch='';}
 return true;
}
