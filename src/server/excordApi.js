// Excord: authenticated HTTP operations. No message content is broadcast globally.
// The existing game's random client key is a bearer credential: never log or expose it.
const crypto = require('crypto');
const { verifySession } = require('./excordSession');
const OFFICIAL = '1420070400000000001';
const id = () => crypto.randomUUID();
const text = (s, max = 200) => String(s ?? '').trim().slice(0, max);
class Denied extends Error { constructor(message, status = 403) { super(message); this.status = status; } }
const insist = (v, message = 'Access denied.', status = 403) => { if (!v) throw new Denied(message, status); };

async function handleExcordRequest({ req, res, pgPool: db, readJsonBody, sendJson, getClientKey }) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  try {
    insist(db, 'Service temporarily unavailable.', 503);
    insist(req.method === 'POST', 'Use a signed-in request.', 405);
    insist(String(req.headers['content-type'] || '').startsWith('application/json'), 'Expected a JSON request.', 415);
    const b = await readJsonBody(req, 32768);
    const q = async (sql, args = []) => (await db.query(sql, args)).rows;
    const one = async (sql, args = []) => (await q(sql, args))[0];
    const me = await one('SELECT id,username,is_guest FROM public.profiles WHERE client_key=$1 AND is_signed_in=true', [getClientKey(req,b)]);
    insist(me, 'Sign in to use Excord.', 401);
    insist(!me.is_guest, 'Excord is unavailable for Guest accounts.');
    insist(await verifySession(db,req,me.id), 'For private Excord access, sign out of Exotic and sign back in once to verify this browser.',401);
    const action = text(b.action, 40);
    const write = !['bootstrap','channel','search','discover','audit'].includes(action);
    const rate = await one(`INSERT INTO public.excord_rate_limits(profile_id,bucket) VALUES($1,$2)
      ON CONFLICT(profile_id,bucket) DO UPDATE SET
      hits=CASE WHEN excord_rate_limits.window_at < now()-interval '1 minute' THEN 1 ELSE excord_rate_limits.hits+1 END,
      window_at=CASE WHEN excord_rate_limits.window_at < now()-interval '1 minute' THEN now() ELSE excord_rate_limits.window_at END RETURNING hits`, [me.id,write?'write':'read']);
    insist(Number(rate.hits) <= (write?40:120), 'Too many requests. Try again in a minute.',429);
    await q(`INSERT INTO public.excord_user_profiles(profile_id,display_name) VALUES($1,$2)
      ON CONFLICT(profile_id) DO UPDATE SET last_seen_at=now()`,[me.id,me.username]);
    await q(`INSERT INTO public.excord_server_members(server_id,profile_id,role_ids) VALUES($1,$2,'{role_exotic_runner}') ON CONFLICT DO NOTHING`,[OFFICIAL,me.id]);

    const server = async (sid, manage=false) => {
      const s = await one(`SELECT s.* FROM public.excord_servers s JOIN public.excord_server_members m ON m.server_id=s.id
        WHERE s.id=$1 AND m.profile_id=$2 AND NOT EXISTS(SELECT 1 FROM public.excord_bans bn WHERE bn.server_id=s.id AND bn.profile_id=$2)`,[sid,me.id]);
      insist(s,'Server unavailable.');
      if(manage) insist(s.owner_id===me.id,'Only the server owner can make this change.');
      return s;
    };
    const blocked = async (peer) => !!await one(`SELECT 1 FROM public.excord_friendships WHERE status='blocked' AND
      ((requester_id=$1 AND addressee_id=$2) OR(requester_id=$2 AND addressee_id=$1))`,[me.id,peer]);
    const channel = async (cid, posting=false) => {
      const c = await one('SELECT * FROM public.excord_channels WHERE id=$1',[cid]);
      insist(c,'Channel unavailable.');
      insist(!['voice','stage','media'].includes(c.channel_type),'Media channels are not supported in this release.',400);
      if(c.server_id) {
        const s = await server(c.server_id);
        insist(!c.is_private || s.owner_id===me.id,'Private channel.');
        if(posting === 'publish' && c.channel_type==='announcement') insist(s.owner_id===me.id,'Only the server owner can publish announcements.');
      } else {
        insist(['dm','group_dm'].includes(c.channel_type) && (c.dm_member_ids||[]).includes(me.id),'Channel unavailable.');
        if(posting) for(const peer of c.dm_member_ids||[]) if(peer!==me.id) insist(!await blocked(peer),'Messaging is blocked.');
      }
      if(c.parent_channel_id) {
        const parent = await one('SELECT is_private FROM public.excord_channels WHERE id=$1',[c.parent_channel_id]);
        if(parent?.is_private) { const s=await server(c.server_id); insist(s.owner_id===me.id,'Private channel.'); }
      }
      if(posting) insist(!c.archived,'This thread is archived.');
      return c;
    };
    const message = async (mid,posting=false) => {
      const m=await one('SELECT * FROM public.excord_messages WHERE id=$1',[mid]);
      insist(m,'Message unavailable.');
      const c=await channel(m.channel_id,posting);
      return {m,c};
    };
    const audit = async (sid, type, target) => q(`INSERT INTO public.excord_audit_logs(id,server_id,actor_id,actor_username,action_type,target_label) VALUES($1,$2,$3,$4,$5,$6)`,[id(),sid,me.id,me.username,type,text(target,80)]);
    const hydrate = async (cid,before) => q(`SELECT m.id,m.channel_id,m.author_id,m.content,m.reply_to_id,m.poll,m.pinned,m.created_at,m.edited_at,
       p.username AS author_username, ep.display_name AS author_display_name,
       (SELECT jsonb_agg(jsonb_build_object('emoji',r.emoji,'profile_id',r.profile_id)) FROM public.excord_reactions r WHERE r.message_id=m.id) AS reaction_rows,
       (SELECT jsonb_agg(jsonb_build_object('option_index',v.option_index,'profile_id',v.profile_id)) FROM public.excord_votes v WHERE v.message_id=m.id) AS votes
       FROM public.excord_messages m LEFT JOIN public.profiles p ON p.id=m.author_id
       LEFT JOIN public.excord_user_profiles ep ON ep.profile_id=m.author_id
       WHERE m.channel_id=$1 AND ($2::timestamptz IS NULL OR m.created_at<$2::timestamptz)
       ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,[cid,before||null]);
    let result = {};
    if(action==='bootstrap') {
      const [ep,servers,channels,friends,dms] = await Promise.all([
        one('SELECT display_name,bio,pronouns,presence_status,custom_status_text FROM public.excord_user_profiles WHERE profile_id=$1',[me.id]),
        q(`SELECT s.id,s.name,s.description,s.owner_id,s.is_official,s.invite_code,s.is_public,CASE WHEN s.owner_id=$1 THEN s.automod_config ELSE NULL END AS automod_config,
           (SELECT count(*)::int FROM public.excord_server_members sm WHERE sm.server_id=s.id) member_count
           FROM public.excord_servers s JOIN public.excord_server_members sm ON sm.server_id=s.id
           WHERE sm.profile_id=$1 ORDER BY s.is_official DESC,s.created_at`,[me.id]),
        q(`SELECT c.id,c.server_id,c.name,c.channel_type,c.topic,c.parent_channel_id,c.is_private,c.slowmode_sec,c.archived FROM public.excord_channels c
           JOIN public.excord_servers s ON s.id=c.server_id JOIN public.excord_server_members sm ON sm.server_id=s.id
           WHERE sm.profile_id=$1 AND (NOT c.is_private OR s.owner_id=$1)
           AND c.channel_type NOT IN ('voice','stage','media') AND (c.parent_channel_id IS NULL OR NOT EXISTS(SELECT 1 FROM public.excord_channels pc WHERE pc.id=c.parent_channel_id AND pc.is_private AND s.owner_id<>$1)) ORDER BY c.position,c.created_at`,[me.id]),
        q(`SELECT f.id,f.requester_id,f.addressee_id,f.status,p.username AS peer_username,p.id AS peer_id
           FROM public.excord_friendships f JOIN public.profiles p ON p.id=CASE WHEN f.requester_id=$1 THEN f.addressee_id ELSE f.requester_id END
           WHERE f.requester_id=$1 OR f.addressee_id=$1`,[me.id]),
        q(`SELECT c.id,c.name,c.channel_type,
           (SELECT jsonb_agg(jsonb_build_object('id',p.id,'username',p.username)) FROM public.profiles p WHERE p.id=ANY(c.dm_member_ids) AND p.id<>$1) peers
           FROM public.excord_channels c WHERE c.channel_type IN ('dm','group_dm') AND $1::uuid=ANY(c.dm_member_ids) ORDER BY c.created_at DESC`,[me.id])
      ]);
      result={me:{...me,...ep},servers,channels,friends,dms};
    } else if(action==='channel') {
      const c=await channel(text(b.channelId,80));
      const messages=await hydrate(c.id,b.before);
      const members = c.server_id ? await q(`SELECT p.id,p.username,ep.display_name,ep.custom_status_text,
        CASE WHEN ep.last_seen_at>now()-interval '70 seconds' THEN ep.presence_status ELSE 'invisible' END AS presence_status,
        (s.owner_id=p.id) AS is_owner FROM public.excord_server_members sm JOIN public.profiles p ON p.id=sm.profile_id
        JOIN public.excord_servers s ON s.id=sm.server_id LEFT JOIN public.excord_user_profiles ep ON ep.profile_id=p.id
        WHERE sm.server_id=$1 ORDER BY p.username LIMIT 100`,[c.server_id]):[];
      result={channel:c,messages:messages.reverse(),members};
    } else if(action==='send') {
      const c=await channel(text(b.channelId,80),'publish');
      insist(!['voice','stage','forum','media'].includes(c.channel_type),'Create a discussion or select a text channel.');
      let content=text(b.content,4000);
      let poll=null;
      if(b.poll) {
        const options=Array.isArray(b.poll.options)?b.poll.options.map(o=>text(o,90)).filter(Boolean).slice(0,8):[];
        insist(options.length>=2 && text(b.poll.question,180),'A poll needs a question and at least two choices.',400);
        poll={question:text(b.poll.question,180),options,expiresAt:new Date(Date.now()+86400000).toISOString()};
      }
      insist(content || poll,'Write a message first.',400);
      if(b.replyToId) { const reply=await message(text(b.replyToId,80)); insist(reply.m.channel_id===c.id,'Reply must be in the same channel.',400); }
      if(c.server_id) {
        const s=await server(c.server_id), am=s.automod_config||{};
        if(am.enabled) {
          insist(!(am.blockedWords||[]).some(w=>String(w).trim()&&content.toLowerCase().includes(String(w).toLowerCase())),'AutoMod blocked this message.',400);
          insist((content.match(/@\w+/g)||[]).length<=Number(am.maxMentions||6),'Too many mentions.',400);
        }
      }
      if(c.slowmode_sec>0) {
        const slot=await one(`INSERT INTO public.excord_send_slots(profile_id,channel_id,next_at) VALUES($1,$2,now()+($3::integer * interval '1 second'))
          ON CONFLICT(profile_id,channel_id) DO UPDATE SET next_at=EXCLUDED.next_at WHERE excord_send_slots.next_at<=now() RETURNING profile_id`,[me.id,c.id,c.slowmode_sec]);
        insist(slot,'Slowmode: please wait before sending again.',429);
      }
      const mid=id();
      await q(`INSERT INTO public.excord_messages(id,channel_id,author_id,content,reply_to_id,poll) VALUES($1,$2,$3,$4,$5,$6::jsonb)`,[mid,c.id,me.id,content,b.replyToId||null,poll?JSON.stringify(poll):null]);
      result={messageId:mid};
    } else if(['edit','delete','pin','react','vote','bookmark'].includes(action)) {
      const {m,c}=await message(text(b.messageId,80),true);
      if(action==='edit') {
        insist(m.author_id===me.id,'Only your own messages can be edited.');
        insist(!m.poll,'Poll text cannot be edited.');
        const content=text(b.content,4000); insist(content,'Message cannot be empty.',400);
        if(c.server_id) {const s=await server(c.server_id),am=s.automod_config||{}; insist(!am.enabled||!(am.blockedWords||[]).some(w=>String(w).trim()&&content.toLowerCase().includes(String(w).toLowerCase())),'AutoMod blocked this edit.',400);}
        await q('UPDATE public.excord_messages SET content=$1,edited_at=now() WHERE id=$2',[content,m.id]);
      }
      if(action==='delete') {
        if(m.author_id!==me.id) {insist(c.server_id); await server(c.server_id,true);}
        await q('DELETE FROM public.excord_messages WHERE id=$1',[m.id]);
      }
      if(action==='pin') {
        if(c.server_id) await server(c.server_id,true);
        await q('UPDATE public.excord_messages SET pinned=NOT pinned WHERE id=$1',[m.id]);
      }
      if(action==='react') {
        insist(['heart','fire','check','trophy','eyes'].includes(b.emoji),'Unknown reaction.',400);
        if(b.remove) await q('DELETE FROM public.excord_reactions WHERE message_id=$1 AND profile_id=$2 AND emoji=$3',[m.id,me.id,b.emoji]);
        else await q('INSERT INTO public.excord_reactions(message_id,profile_id,emoji) VALUES($1,$2,$3) ON CONFLICT DO NOTHING',[m.id,me.id,b.emoji]);
      }
      if(action==='vote') {
        const n=Number(b.optionIndex);
        insist(m.poll&&new Date(m.poll.expiresAt).getTime()>Date.now(),'Poll is closed.',400);
        insist(Number.isInteger(n)&&n>=0&&n<m.poll.options.length,'Invalid poll choice.',400);
        await q(`INSERT INTO public.excord_votes(message_id,profile_id,option_index) VALUES($1,$2,$3)
          ON CONFLICT(message_id,profile_id) DO UPDATE SET option_index=EXCLUDED.option_index`,[m.id,me.id,n]);
      }
      if(action==='bookmark') await q('INSERT INTO public.excord_bookmarks(profile_id,message_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[me.id,m.id]);
    } else if(action==='create_server') {
      const name=text(b.name,48); insist(name,'Name your server.',400);
      const count=await one('SELECT count(*)::int AS n FROM public.excord_servers WHERE owner_id=$1',[me.id]); insist(count.n<10,'Server limit reached.',400);
      const sid=id(), invite=crypto.randomBytes(12).toString('hex');
      await q('INSERT INTO public.excord_servers(id,name,description,owner_id,invite_code,is_public) VALUES($1,$2,$3,$4,$5,$6)',[sid,name,text(b.description),me.id,invite,!!b.isPublic]);
      await q('INSERT INTO public.excord_server_members(server_id,profile_id) VALUES($1,$2)',[sid,me.id]);
      await q(`INSERT INTO public.excord_channels(id,server_id,name,channel_type,topic) VALUES($1,$2,'general','text','Your community starts here.')`,[id(),sid]);
      await audit(sid,'SERVER_CREATE',name); result={serverId:sid};
    } else if(action==='join') {
      const s=await one('SELECT id FROM public.excord_servers WHERE invite_code=$1',[text(b.code,80)]); insist(s,'Invite not found.',404);
      insist(!await one('SELECT 1 FROM public.excord_bans WHERE server_id=$1 AND profile_id=$2',[s.id,me.id]),'You cannot join this server.');
      await q('INSERT INTO public.excord_server_members(server_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[s.id,me.id]); result={serverId:s.id};
    } else if(action==='discover') {
      result={servers:await q(`SELECT s.id,s.name,s.description,s.invite_code,(SELECT count(*)::int FROM public.excord_server_members m WHERE m.server_id=s.id) AS member_count
        FROM public.excord_servers s WHERE is_public=true AND NOT EXISTS(SELECT 1 FROM public.excord_bans bn WHERE bn.server_id=s.id AND bn.profile_id=$1) ORDER BY is_official DESC,created_at DESC LIMIT 40`,[me.id])};
    } else if(action==='create_channel') {
      await server(text(b.serverId,80),true);
      insist(['text','announcement','forum'].includes(b.type),'Unsupported channel type.',400);
      const name=text(b.name,48); insist(name,'Name your channel.',400);
      const cid=id(); await q(`INSERT INTO public.excord_channels(id,server_id,name,channel_type,topic,is_private,slowmode_sec,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8)`,[cid,b.serverId,name,b.type,text(b.topic,180),!!b.isPrivate,Math.min(300,Math.max(0,Math.floor(Number(b.slowmode)||0))),me.id]);
      await audit(b.serverId,'CHANNEL_CREATE',name); result={channelId:cid};
    } else if(action==='thread') {
      const c=await channel(text(b.channelId,80),true);
      insist(c.server_id&&['text','forum','announcement'].includes(c.channel_type),'Choose a server text or forum channel.',400);
      const name=text(b.name,90), content=text(b.content,4000); insist(name&&content,'Add a title and opening message.',400);
      const srv=await server(c.server_id),am=srv.automod_config||{};
      insist(!am.enabled||!(am.blockedWords||[]).some(w=>String(w).trim()&&(name+' '+content).toLowerCase().includes(String(w).toLowerCase())),'AutoMod blocked this discussion.',400);
      const tid=id(); await q(`INSERT INTO public.excord_channels(id,server_id,name,channel_type,parent_channel_id,is_private,created_by) VALUES($1,$2,$3,'thread',$4,$5,$6)`,[tid,c.server_id,name,c.id,c.is_private,me.id]);
      await q('INSERT INTO public.excord_messages(id,channel_id,author_id,content) VALUES($1,$2,$3,$4)',[id(),tid,me.id,content]);result={channelId:tid};
    } else if(action==='friend_request') {
      const peer=await one('SELECT id,username FROM public.profiles WHERE lower(username)=lower($1) AND is_guest=false',[text(b.username,20).replace(/^@/,'')]);
      insist(peer&&peer.id!==me.id,'Registered user not found.',404); insist(!await blocked(peer.id),'Request unavailable.');
      const f=await one(`SELECT * FROM public.excord_friendships WHERE(requester_id=$1 AND addressee_id=$2)OR(requester_id=$2 AND addressee_id=$1)`,[me.id,peer.id]);
      if(!f) await q(`INSERT INTO public.excord_friendships(requester_id,addressee_id,status) VALUES($1,$2,'pending') ON CONFLICT DO NOTHING`,[me.id,peer.id]);
      else if(f.status==='pending'&&f.addressee_id===me.id) await q("UPDATE public.excord_friendships SET status='accepted' WHERE id=$1",[f.id]);
    } else if(action==='friend') {
      const f=await one('SELECT * FROM public.excord_friendships WHERE id=$1 AND(requester_id=$2 OR addressee_id=$2)',[text(b.friendId,80),me.id]); insist(f,'Relationship unavailable.');
      if(b.decision==='accept') {insist(f.status==='pending'&&f.addressee_id===me.id);await q("UPDATE public.excord_friendships SET status='accepted' WHERE id=$1",[f.id]);}
      else if(b.decision==='block') {
        await q("UPDATE public.excord_friendships SET status='blocked',requester_id=$1,addressee_id=$2 WHERE id=$3",[me.id,f.requester_id===me.id?f.addressee_id:f.requester_id,f.id]);
      } else {insist(f.status!=='blocked'||f.requester_id===me.id,'Only the blocking user can unblock.');await q('DELETE FROM public.excord_friendships WHERE id=$1',[f.id]);}
    } else if(action==='dm') {
      const peers=Array.from(new Set((Array.isArray(b.peerIds)?b.peerIds:[]).map(p=>text(p,80)))).filter(p=>p!==me.id).slice(0,9);
      insist(peers.length,'Choose at least one friend.',400);
      for(const p of peers) {
        insist(!await blocked(p),'Messaging is blocked.');
        insist(await one(`SELECT 1 FROM public.excord_friendships WHERE status='accepted' AND ((requester_id=$1 AND addressee_id=$2)OR(requester_id=$2 AND addressee_id=$1))`,[me.id,p]),'Only accepted friends can be invited to a conversation.');
      }
      let cid;
      if(peers.length===1) cid=(await one(`SELECT id FROM public.excord_channels WHERE channel_type='dm' AND dm_member_ids @> ARRAY[$1::uuid,$2::uuid] AND cardinality(dm_member_ids)=2`,[me.id,peers[0]]))?.id;
      if(!cid) {cid=id();await q(`INSERT INTO public.excord_channels(id,name,channel_type,dm_member_ids,created_by) VALUES($1,$2,$3,ARRAY(SELECT jsonb_array_elements_text($4::jsonb)::uuid),$5)`,[cid,text(b.name,48)||'Direct message',peers.length===1?'dm':'group_dm',JSON.stringify([me.id,...peers]),me.id]);}
      result={channelId:cid};
    } else if(action==='profile') {
      insist(['online','idle','dnd','invisible'].includes(b.presence),'Choose a valid status.',400);
      await q('UPDATE public.excord_user_profiles SET display_name=$1,bio=$2,pronouns=$3,presence_status=$4,custom_status_text=$5 WHERE profile_id=$6',[text(b.displayName,32)||me.username,text(b.bio,220),text(b.pronouns,28),b.presence,text(b.status,80),me.id]);
    } else if(action==='search') {
      const c=await channel(text(b.channelId,80));
      const rows=await hydrate(c.id,null); // bounded first-release search, explicitly shown as recent messages
      const term=text(b.query,100).toLowerCase(); result={messages:rows.filter(m=>m.content.toLowerCase().includes(term)&&(!b.pinsOnly||m.pinned)).reverse()};
    } else if(action==='settings') {
      const s=await server(text(b.serverId,80),true);
      const blockedWords=text(b.blockedWords,500).split(',').map(w=>w.trim()).filter(Boolean).slice(0,30);
      await q('UPDATE public.excord_servers SET name=$1,description=$2,is_public=$3,automod_config=$4::jsonb WHERE id=$5',[text(b.name,48)||s.name,text(b.description),!!b.isPublic,JSON.stringify({enabled:true,blockedWords,maxMentions:6}),s.id]);
      await audit(s.id,'SERVER_UPDATE',s.name);
    } else if(action==='leave') {
      const s=await server(text(b.serverId,80)); insist(s.id!==OFFICIAL,'The official community stays available to registered players.');
      insist(s.owner_id!==me.id,'Owners must delete their server rather than leave it.');
      await q('DELETE FROM public.excord_server_members WHERE server_id=$1 AND profile_id=$2',[s.id,me.id]);
    } else if(action==='delete_server') {
      const s=await server(text(b.serverId,80),true); insist(s.id!==OFFICIAL); insist(b.confirm===s.name,'Type the exact server name to delete.',400);
      await q('DELETE FROM public.excord_servers WHERE id=$1',[s.id]);
    } else if(action==='ban') {
      const s=await server(text(b.serverId,80),true); insist(b.peerId!==me.id);
      insist(await one('SELECT 1 FROM public.excord_server_members WHERE server_id=$1 AND profile_id=$2',[s.id,b.peerId]),'Member unavailable.');
      await q('INSERT INTO public.excord_bans(server_id,profile_id) VALUES($1,$2) ON CONFLICT DO NOTHING',[s.id,b.peerId]);
      await q('DELETE FROM public.excord_server_members WHERE server_id=$1 AND profile_id=$2',[s.id,b.peerId]);await audit(s.id,'MEMBER_BAN',b.peerId);
    } else if(action==='audit') {
      const s=await server(text(b.serverId,80),true);result={logs:await q('SELECT actor_username,action_type,target_label,created_at FROM public.excord_audit_logs WHERE server_id=$1 ORDER BY created_at DESC LIMIT 50',[s.id])};
    } else throw new Denied('This feature is not supported in this release.',400);
    sendJson(res,200,{ok:true,...result});
  } catch(e) {
    const status=e.status||500;
    if(status===500) console.error('[Excord] Request failed:',e.message);
    sendJson(res,status,{ok:false,reason:status===500?'Excord could not complete this request. Please try again.':e.message});
  }
}
module.exports={handleExcordRequest};
