// Keep legacy stored grants compatible while presenting the current access names.
export const accessOptions=[{value:'View',label:'Viewer'},{value:'Edit',label:'Contributor'},{value:'Editor',label:'Editor'},{value:'Manage',label:'Manager'}];
export const accessLevel=(value:string)=>({View:1,Viewer:1,Edit:2,Contributor:2,Editor:2.5,Manage:3,Manager:3}[value]||0);
export const accessLabel=(value:string)=>accessName(accessLevel(value));
export const accessName=(level:number)=>level>=4?'Administrator':level>=3?'Manager':level>=2.5?'Editor':level>=2?'Contributor':level>=1?'Viewer':'No Access';
export const storedAccess=(level:number)=>level>=3?'Manage':level>=2.5?'Editor':level>=2?'Edit':level>=1?'View':'';
export const validAccess=(value:string)=>accessLevel(value)>0;
