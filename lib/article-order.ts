export function compareArticles(a:any,b:any){
 const ao=typeof a.order==='number'?a.order:Number.MAX_SAFE_INTEGER,bo=typeof b.order==='number'?b.order:Number.MAX_SAFE_INTEGER;
 return ao-bo||b.publishDate.localeCompare(a.publishDate)||b.createdAt.localeCompare(a.createdAt)||a.id.localeCompare(b.id);
}
