export async function emailError(response:Response):Promise<string>{
 const body:any=await response.json().catch(()=>({}));
 const name=typeof body.name==='string'?body.name:'';
 const message=typeof body.message==='string'?body.message.toLowerCase():'';
 if(message.includes('not verified')||message.includes('verify a domain')||message.includes('testing emails'))return 'The sending domain is not verified in Resend. Verify notifications.aspireone.ai, then resend the invitation.';
 if(name==='invalid_api_key'||name==='missing_api_key')return 'Resend rejected the API key. Update RESEND_API_KEY in Cloudflare Worker secrets.';
 if(name==='restricted_api_key'||message.includes('not authorized'))return 'The Resend API key cannot send from this domain. Allow sending from notifications.aspireone.ai.';
 if(name.includes('quota')||response.status===429)return 'Resend has reached a sending limit. Check the Resend account limits before retrying.';
 if(name==='invalid_from_address')return 'The invitation sender address is invalid. Check INVITE_FROM in Cloudflare.';
 const code=/^[a-z_]{1,60}$/.test(name)?name:'unknown';
 return `Resend rejected the invitation (HTTP ${response.status}, ${code}). Check the failed request in Resend Logs.`;
}
