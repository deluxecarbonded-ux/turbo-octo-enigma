const crypto=require('crypto');
const NAME='excord_session';
const digest=token=>crypto.createHash('sha256').update(token).digest('hex');
function cookie(req,value,age) {
  const secure=String(req.headers['x-forwarded-proto']||'')==='https'||process.env.VERCEL;
  return `${NAME}=${value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${age}${secure?'; Secure':''}`;
}
async function issueSession(db,req,res,key) {
  const q=await db.query('SELECT id FROM public.profiles WHERE client_key=$1 AND is_signed_in AND NOT is_guest',[key]);
  if(!q.rows[0])return;
  const token=crypto.randomBytes(32).toString('hex');
  await db.query(`INSERT INTO public.excord_sessions(token_hash,profile_id,expires_at) VALUES($1,$2,now()+interval '30 days')`,[digest(token),q.rows[0].id]);
  res.setHeader('Set-Cookie',cookie(req,token,30*86400));
}
async function revokeSessions(db,req,res,key) {
  await db.query('DELETE FROM public.excord_sessions WHERE profile_id IN (SELECT id FROM public.profiles WHERE client_key=$1)',[key]);
  res.setHeader('Set-Cookie',cookie(req,'',0));
}
async function verifySession(db,req,profileId) {
  const token=String(req.headers.cookie||'').split(';').map(s=>s.trim()).find(s=>s.startsWith(NAME+'='))?.slice(NAME.length+1)||'';
  if(!/^[a-f0-9]{64}$/.test(token))return false;
  const q=await db.query('SELECT 1 FROM public.excord_sessions WHERE token_hash=$1 AND profile_id=$2 AND expires_at>now()',[digest(token),profileId]);return !!q.rows[0];
}
module.exports={issueSession,revokeSessions,verifySession};
