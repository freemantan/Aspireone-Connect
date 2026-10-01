import type {Price} from './planning';
import approved from './october-prices.json';
export const proposalVersion='2027-october-01';
export function applyOctoberPrices(prices:Price[]):Price[]{
 return prices.map(p=>{const replacement=approved.find(x=>x.id===p.id);return replacement?{...replacement}:p;});
}
export function priceOrder(prices:Price[]){return [...prices].sort((a,b)=>a.product.localeCompare(b.product)||(a.displayOrder??1000)-(b.displayOrder??1000)||(a.tier??0)-(b.tier??0));}
export function priceFigures(p:Price,standard:Price|undefined){
 const units=['A','B'].includes(p.product)?([1,8,12,36][p.tier??0]):p.units||1;
 const base=standard?.amount??null,discount=base===null||p.amount===null?null:base-p.amount;
 return {units,total:p.amount===null?null:p.amount*units,discount,totalDiscount:discount===null?null:discount*units,percent:base&&discount!==null?discount/base*100:null,previousTotal:p.previous==null?null:p.previous*units};
}
// Persisted dollar discounts drive A/B tier prices, never rounded percentages.
export function calculatePriceTiers(prices:Price[]):Price[]{return prices.map(p=>{
 if(!['A','B'].includes(p.product)||!p.tier||p.discount===undefined)return p;
 const standard=prices.find(x=>x.product===p.product&&x.group===p.group&&x.level===p.level&&x.tier===0);
 return {...p,amount:standard?.amount==null||p.discount===null?null:standard.amount-p.discount};
});}
export function editPrice(prices:Price[],id:string,value:number|null,field:'amount'|'discount'='amount'):Price[]{
 return calculatePriceTiers(prices.map(p=>p.id===id?{...p,[field]:value}:p));
}
