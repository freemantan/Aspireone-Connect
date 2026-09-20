export const baseColumnOrder=['chats','assignee','team','budget','status','priority','start','due','remark','links'];
export function columnOrder(board:any):string[]{
 const available=[...baseColumnOrder,...(board?.columns||[]).filter((c:any)=>!c.archived).map((c:any)=>c.id)];
 return [...new Set([...(board?.columnOrder||[]).filter((id:string)=>available.includes(id)),...available])];
}
export function moveColumn(order:string[],source:string,target:string){
 if(source===target||!order.includes(source)||!order.includes(target))return order;
 const result=order.filter(id=>id!==source);result.splice(order.indexOf(target),0,source);return result;
}
