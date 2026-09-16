export const standardColumns=['assignee','team','budget','priority','start','due','remark','links'];
export function columnPreferences(board:any,saved:any):string[]{
 const ids=(board?.columns||[]).filter((c:any)=>!c.archived).map((c:any)=>c.id);
 if(!saved)return board?.hidden||[];
 if(Array.isArray(saved))return [...new Set([...saved,...ids.filter((id:string)=>(board?.hidden||[]).includes(id))])];
 return [...new Set([...(saved.hidden||[]),...ids.filter((id:string)=>!(saved.known||[]).includes(id)&&(board?.hidden||[]).includes(id))])] as string[];
}
