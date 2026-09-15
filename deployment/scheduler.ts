/** Separate private Worker. Cron times are UTC; date calculations happen in the app in Asia/Singapore. */
export default {
 async scheduled(_event: unknown, env: { APP_ORIGIN:string; CRON_SECRET:string }, ctx: { waitUntil(p:Promise<unknown>):void }) {
  ctx.waitUntil((async()=>{const response=await fetch(env.APP_ORIGIN+'/api/scheduler',{method:'POST',headers:{Authorization:'Bearer '+env.CRON_SECRET}});if(!response.ok)throw new Error('AspireOne recurrence run failed: '+response.status);console.log('Recurrence run',await response.text());})());
 }
};
