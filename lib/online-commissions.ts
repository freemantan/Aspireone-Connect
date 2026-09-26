import {Budget,Rules,clone} from './planning';
import {materializeBudget} from './budget-drivers';
// AH referrals use the Physical Centre / initial-sale commission set for C and D.
export function linkedOnlineCommissions(b:Budget,r:Rules):Budget{
 const next=clone(b);
 for(const [id,product] of [['cc','C'],['dc','D']]){
  const l=next.lines.find(l=>l.id===id);if(!l||l.method!=='percent')continue;
  const rates=r.rates.initial['Physical Centre'][product],commission=rates.some(v=>v===null)?null:rates.reduce<number>((sum,v)=>sum+v!,0);
  const referred=l.driver?.kind==='referral'?l.driver.referred:30;
  l.rateSource='custom';l.driver={kind:'referral',referred,commission};
 }
 return materializeBudget(next);
}
