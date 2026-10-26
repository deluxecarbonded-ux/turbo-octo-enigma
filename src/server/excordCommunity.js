// Additional community operations share the same verified identity and object guards.
const crypto=require('crypto');
const text=(v,n=200)=>String(v??'').trim().slice(0,n);
const uuid=()=>crypto.randomUUID();
module.exports=async function community(ctx) {
 const {action,b,me,q,one,server,channel,message,audit,insist,hydrate}=ctx;
 if(action==='bookmark') {
  const {m}=await message(text(b.messageId,80));
  if(b.remove) await q('DELETE FROM public.excord_bookmarks WHERE profile_id=$1 AND message_id=$2',[me.id,m.id]);
  else await q(`INSERT INTO public.excord_bookmarks(profile_id,message_id,note) VALUES($1,$2,$3)
    ON CONFLICT(profile_id,message_id) DO UPDATE SET note=EXCLUDED.note`,[me.id,m.id,text(b.note,140)]);
  return {};
 }
 if(action==='saved') {
  const rows=await q(`SELECT bm.note,bm.created_at AS saved_at,m.id,m.channel_id,m.content,m.created_at,p.username AS author_username,c.name AS channel_name
    FROM public.excord_bookmarks bm JOIN public.excord_messages m ON m.id=bm.message_id
    JOIN public.excord_channels c ON c.id=m.channel_id LEFT JOIN public.profiles p ON p.id=m.author_id
    WHERE bm.profile_id=$1 ORDER BY bm.created_at DESC LIMIT 100`,[me.id]);
  const allowed=new Map(),items=[];
  for(const row of rows) {
   if(!allowed.has(row.channel_id)) {try {await channel(row.channel_id);allowed.set(row.channel_id,true);}catch(e){if(e.status===403)allowed.set(row.channel_id,false);else throw e;}}
   if(allowed.get(row.channel_id))items.push(row);
  }
  return {items};
 }
 if(['mark_read','typing'].includes(action)) {
  const c=await channel(text(b.channelId,80),action==='typing');
  if(action==='mark_read') await q(`INSERT INTO public.excord_reads(profile_id,channel_id,read_at) VALUES($1,$2,least(now(),coalesce($3::timestamptz,now())))
    ON CONFLICT(profile_id,channel_id) DO UPDATE SET read_at=greatest(excord_reads.read_at,EXCLUDED.read_at)`,[me.id,c.id,b.readAt||null]);
  else await q(`INSERT INTO public.excord_typing(profile_id,channel_id) VALUES($1,$2)
    ON CONFLICT(profile_id,channel_id) DO UPDATE SET updated_at=now()`,[me.id,c.id]);
  return {};
 }
 if(action==='member_settings') {
  const s=await server(text(b.serverId,80));
  await q('UPDATE public.excord_server_members SET nickname=$1,muted_server=$2 WHERE server_id=$3 AND profile_id=$4',[text(b.nickname,32),!!b.muted,s.id,me.id]);
  return {};
 }
 if(action==='channel_settings'||action==='delete_channel'||action==='archive') {
  const c=await channel(text(b.channelId,80));insist(c.server_id,'Server channels only.');await server(c.server_id,true);
  if(action==='archive') {insist(c.channel_type==='thread','Only discussion threads can be archived.',400);await q('UPDATE public.excord_channels SET archived=$1 WHERE id=$2',[!!b.archived,c.id]);}
  if(action==='channel_settings') {
   const name=text(b.name,48);insist(name,'Give the channel a name.',400);
   await q(`UPDATE public.excord_channels SET name=$1,topic=$2,category_name=$3,position=$4,slowmode_sec=$5,is_private=$6 WHERE id=$7`,[name,text(b.topic,180),text(b.category,32)||'Channels',Math.min(999,Math.max(0,Math.floor(Number(b.position)||0))),Math.min(300,Math.max(0,Math.floor(Number(b.slowmode)||0))),!!b.isPrivate,c.id]);
  }
  if(action==='delete_channel') {
   insist(b.confirm===c.name,'Type the exact channel name to delete.',400);
   const primary=await one(`SELECT id FROM public.excord_channels WHERE server_id=$1 AND parent_channel_id IS NULL ORDER BY created_at,id LIMIT 1`,[c.server_id]);
   insist(primary?.id!==c.id,'Keep the original server channel. You can rename it instead.',400);
   await q('DELETE FROM public.excord_channels WHERE id=$1',[c.id]);
  }
  await audit(c.server_id,action.toUpperCase(),c.name);return {};
 }
 if(action==='rotate_invite') {
  const s=await server(text(b.serverId,80),true);insist(!s.is_official);
  const code=crypto.randomBytes(12).toString('hex');await q('UPDATE public.excord_servers SET invite_code=$1 WHERE id=$2',[code,s.id]);
  await audit(s.id,'INVITE_ROTATE','Previous invite revoked');return {inviteCode:code};
 }
 if(action==='transfer') {
  const s=await server(text(b.serverId,80),true);insist(!s.is_official);insist(b.confirm===s.name,'Type the server name to confirm.',400);
  const peer=await one(`SELECT p.id FROM public.profiles p JOIN public.excord_server_members m ON m.profile_id=p.id
   WHERE m.server_id=$1 AND p.username=$2 AND NOT p.is_guest AND p.id<>$3
   AND NOT EXISTS(SELECT 1 FROM public.excord_bans bn WHERE bn.server_id=m.server_id AND bn.profile_id=p.id)`,[s.id,text(b.username,20),me.id]);
  insist(peer,'Choose another current server member.',400);
  const updated=await q('UPDATE public.excord_servers SET owner_id=$1 WHERE id=$2 AND owner_id=$3 RETURNING id',[peer.id,s.id,me.id]);insist(updated.length);
  await audit(s.id,'OWNER_TRANSFER',b.username);return {};
 }
 if(action==='kick'||action==='unban'||action==='bans') {
  const s=await server(text(b.serverId,80),true);
  if(action==='bans')return {bans:await q('SELECT p.id,p.username FROM public.excord_bans bn JOIN public.profiles p ON p.id=bn.profile_id WHERE bn.server_id=$1 ORDER BY p.username',[s.id])};
  insist(b.peerId!==me.id);
  if(action==='kick') await q('DELETE FROM public.excord_server_members WHERE server_id=$1 AND profile_id=$2',[s.id,b.peerId]);
  else await q('DELETE FROM public.excord_bans WHERE server_id=$1 AND profile_id=$2',[s.id,b.peerId]);
  await audit(s.id,action.toUpperCase(),b.peerId);return {};
 }
 if(['events','create_event','rsvp','delete_event'].includes(action)) {
  let s;
  if(action==='rsvp'||action==='delete_event') {
   const e=await one('SELECT * FROM public.excord_events WHERE id=$1',[text(b.eventId,80)]);insist(e,'Event unavailable.');s=await server(e.server_id,action==='delete_event');
   if(action==='delete_event') {await q('DELETE FROM public.excord_events WHERE id=$1',[e.id]);await audit(s.id,'EVENT_DELETE',e.title);}
   else {insist(new Date(e.starts_at).getTime()>Date.now(),'This event has already started.',400);await q(`UPDATE public.excord_events SET interested_ids=CASE WHEN $1::uuid=ANY(interested_ids) THEN array_remove(interested_ids,$1::uuid) ELSE array_append(interested_ids,$1::uuid) END WHERE id=$2`,[me.id,e.id]);}
  } else s=await server(text(b.serverId,80),action==='create_event');
  if(action==='create_event') {
   const date=new Date(b.startsAt);insist(Number.isFinite(date.getTime())&&date.getTime()>Date.now()&&date.getTime()<Date.now()+366*86400000,'Choose a future date within a year.',400);
   const title=text(b.title,80);insist(title,'Name your event.',400);
   await q(`INSERT INTO public.excord_events(id,server_id,creator_id,title,description,location_label,starts_at) VALUES($1,$2,$3,$4,$5,$6,$7::timestamptz)`,[uuid(),s.id,me.id,title,text(b.description,220),text(b.location,100)||'To be announced',date.toISOString()]);
   await audit(s.id,'EVENT_CREATE',title);
  }
  return {events:await q('SELECT * FROM public.excord_events WHERE server_id=$1 AND starts_at>now()-interval \'24 hours\' ORDER BY starts_at LIMIT 50',[s.id])};
 }
 if(action==='group_settings'||action==='group_leave') {
  const c=await channel(text(b.channelId,80));insist(c.channel_type==='group_dm','Choose a group conversation.',400);
  if(action==='group_settings') {insist(c.created_by===me.id,'Only the group creator can rename it.');const name=text(b.name,48);insist(name,'Name your group.',400);await q('UPDATE public.excord_channels SET name=$1 WHERE id=$2',[name,c.id]);}
  else {
   // Departing members permanently lose history access; ownership moves to a remaining member.
   await q(`UPDATE public.excord_channels SET dm_member_ids=array_remove(dm_member_ids,$1::uuid),
    created_by=CASE WHEN created_by=$1 THEN (array_remove(dm_member_ids,$1::uuid))[1] ELSE created_by END WHERE id=$2`,[me.id,c.id]);
   await q('DELETE FROM public.excord_channels WHERE id=$1 AND cardinality(dm_member_ids)=0',[c.id]);
  }
  return {};
 }
 return null;
};
