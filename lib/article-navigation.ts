// Keep the uploaded report intact and retain its existing sandbox policy.
export function withArticleNavigation(html:string,boardId:string){
 const url='/?board='+encodeURIComponent(boardId);
 const nav=`<nav aria-label="Article navigation" style="display:block;position:relative;z-index:2147483647;padding:14px 24px;background:#f3f7f6;border-bottom:1px solid #dfe6e5;font:600 14px/1.5 system-ui,sans-serif"><a target="_self" href="${url}" style="color:#1e6f73;text-decoration:underline">← Return to all articles</a></nav>`;
 return /<body\b[^>]*>/i.test(html)?html.replace(/<body\b[^>]*>/i,match=>match+nav):nav+html;
}
