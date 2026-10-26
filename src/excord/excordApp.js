(function () {
  'use strict';
  const $ = (s, el=document) => el.querySelector(s);
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span class="ec-icon" aria-hidden="true">${window.ExoticIcons.get(name)}</span>`;
  const btn = (label,action,attrs='',primary=false) => `<button type="button" class="ex-pill-btn ex-pill-btn--${primary?'primary':'secondary'} ex-pill-btn--sm" data-ec="${action}" ${attrs}>${label}</button>`;
  const avatar = (name,large=false) => `<span class="ec-avatar ${large?'ec-avatar--large':''}" aria-hidden="true">${esc((name||'?').slice(0,2).toUpperCase())}</span>`;
  let root, data, channelData, sid=null, cid=null, tab='home', active=false, timer, busy=false, generation=0, reply=null, before=null, messages=[], lastHash='', pollBusy=false;
  let modal=null, restoreFocus=null, hasOlder=false, lastTyping=0;
  const isGuest = () => !window.ExoticAuth?.isSignedIn() || window.ExoticAuth.isGuest();
  const currentServer = () => data?.servers.find(s=>s.id===sid);
  const currentChannel = () => channelData?.channel;
  const owner = () => currentServer()?.owner_id===data?.me.id;
  async function api(action,body={}) {
    const res=await fetch('/api/excord',{method:'POST',headers:{'Content-Type':'application/json','x-exotic-player-id':window.ExoticSupabase.getClientKey()},body:JSON.stringify({action,...body}),cache:'no-store'});
    const r=await res.json(); if(!r.ok) throw new Error(r.reason||'Request failed.'); return r;
  }
  function status(message) { const el=$('#ec-status');if(el) el.textContent=message; }
  function rich(content) {
    // Code is tokenized before formatting; every user-controlled fragment is escaped.
    return String(content||'').split(/(```[\s\S]*?```|`[^`\n]+`)/g).map(part=>{
      if(part.startsWith('```'))return '<pre class="ec-code">'+esc(part.slice(3,-3))+'</pre>';
      if(part.startsWith('`'))return '<code>'+esc(part.slice(1,-1))+'</code>';
      return esc(part).replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/__([^_]+)__/g,'<u>$1</u>').replace(/~~([^~]+)~~/g,'<del>$1</del>').replace(/\*([^*\n]+)\*/g,'<em>$1</em>').replace(/\|\|([^|]+)\|\|/g,'<span tabindex="0" class="ec-spoiler" title="Focus or hover to reveal">$1</span>');
    }).join('');
  }
  function time(t) {return new Date(t).toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'});}
  function closeModal() {modal?.remove();modal=null;restoreFocus?.focus();}
  function dialog(title,description,fields,submit,onSubmit) {
    closeModal(); restoreFocus=document.activeElement;
    modal=document.createElement('div');modal.className='ec-overlay';
    modal.innerHTML=`<div class="ec-dialog" role="dialog" aria-modal="true" aria-labelledby="ec-dialog-title"><h2 id="ec-dialog-title">${esc(title)}</h2><p>${esc(description)}</p><form class="ec-form">${fields}<div class="ec-dialog-error" role="alert"></div><div class="ec-form-footer">${btn('Cancel','cancel')}<button type="submit" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--md">${esc(submit)}</button></div></form></div>`;
    document.body.append(modal);
    modal.addEventListener('click',e=>{if(e.target===modal||e.target.closest('[data-ec="cancel"]')) closeModal();});
    $('form',modal).addEventListener('submit',async e=>{
      e.preventDefault(); const form=e.currentTarget,submitBtn=$('[type=submit]',form);submitBtn.disabled=true;
      try {await onSubmit(new FormData(form));closeModal();} catch(err){$('.ec-dialog-error',form).textContent=err.message;submitBtn.disabled=false;}
    });
    setTimeout(()=>$('input,textarea,select,button',modal)?.focus(),0);
  }
  const input=(name,label,value='',max=100,type='text')=>`<label>${esc(label)}<input name="${name}" type="${type}" maxlength="${max}" value="${esc(value)}" ${type==='datetime-local'?'':'autocomplete="off"'} required></label>`;
  const area=(name,label,value='',max=200)=>`<label>${esc(label)}<textarea name="${name}" maxlength="${max}">${esc(value)}</textarea></label>`;
  const check=(name,label,checked=false)=>`<label><input type="checkbox" name="${name}" ${checked?'checked':''}>${esc(label)}</label>`;
  function paintShell() {
    const server=currentServer();
    root.innerHTML=`<div class="ec-shell">
      <aside class="ec-rail" aria-label="Servers">${btn(icon('excord'),'home','title="Excord home" aria-label="Excord home"',!sid)}
      ${data.servers.map(s=>btn(esc(s.name.slice(0,2).toUpperCase()),'server',`data-id="${s.id}" title="${esc(s.name)}" aria-label="${esc(s.name)}"`,sid===s.id)).join('')}
      ${btn(icon('plus'),'create-server','title="Create server" aria-label="Create server"')}${btn(icon('compass'),'discover','title="Discover communities" aria-label="Discover communities"')}${btn(icon('key'),'join','title="Join with invite" aria-label="Join with invite"')}
      </aside>
      <aside class="ec-side"><div class="ec-brand">${icon('excord')} Excord</div><div class="ec-eyebrow">Your people. Your space.</div>
      <div class="ec-side-title">${esc(server?.name||'Your conversations')}</div>
      <div class="ec-channel-list">${server ? renderChannels() : renderHomeNav()}</div>
      ${server ? `<div class="ec-actions">${btn('Invite','invite')}${btn('Events','events')}${btn('My server profile','member-settings')}${owner()?btn('+ Channel','new-channel')+btn('Manage','settings'):btn('Leave','leave')}</div>`:''}
      <div class="ec-user">${avatar(data.me.display_name||data.me.username)}<span class="ec-grow"><strong>${esc(data.me.display_name||data.me.username)}</strong><br><small>@${esc(data.me.username)}</small></span>${btn(icon('settings'),'profile','aria-label="Edit Excord profile" title="Edit profile"')}</div>
      </aside>
      <section class="ec-center" aria-label="Conversation"><header class="ec-head">${btn(icon('levels'),'nav','aria-label="Show channels"')}<h2 id="ec-title"></h2><div class="ec-head-actions" id="ec-head-actions"></div></header><div class="ec-topic" id="ec-topic"></div>
      <div class="ec-scroll" id="ec-scroll"></div><div class="ec-status" id="ec-status" role="status" aria-live="polite"></div><div class="ec-composer" id="ec-composer"></div></section>
      <aside class="ec-members" id="ec-members" aria-label="Members"></aside></div>`;
    // Avoid duplicate class attributes on the shared button helper.
    $('[data-ec="nav"]',root)?.classList.add('ec-mobile-toggle');
    if(cid) paintChannel(); else paintPage();
  }
  function renderChannels() {
    const channels=data.channels.filter(c=>c.server_id===sid),groups=new Map();
    for(const c of channels){const key=c.parent_channel_id?'Discussions':c.category_name||'Channels';if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
    return [...groups].map(([name,items])=>`<div class="ec-eyebrow" style="padding:16px 10px 6px">${esc(name)}</div>`+items.map(c=>btn(`${icon(c.channel_type==='forum'?'forum':c.channel_type==='announcement'?'megaphone':c.channel_type==='thread'?'thread':'hash')}<span>${esc(c.name)}${c.is_private?' · private':''}${c.archived?' · archived':''}</span>${c.unread_count?`<span class="ec-unread" aria-label="${c.unread_count} unread">${c.unread_count}</span>`:''}`,'channel',`data-id="${c.id}" ${cid===c.id?'aria-current="page"':''}`,cid===c.id)).join('')).join('');
  }
  function renderHomeNav() {
    return btn(`${icon('users')} Friends`,'friends')+btn(`${icon('bookmark')} Saved messages`,'saved')+btn(`${icon('card')} About this release`,'about')+`<div class="ec-eyebrow" style="padding:18px 10px 4px">Direct messages</div>`+
      data.dms.map(d=>btn(`${icon('forum')}<span>${esc(d.channel_type==='dm'?(d.peers?.[0]?.username||'Deleted account'):d.name)}</span>${d.unread_count?`<span class="ec-unread">${d.unread_count}</span>`:''}`,'channel',`data-id="${d.id}"`,cid===d.id)).join('')+
      (!data.dms.length?'<p class="ec-empty">Add a friend to start your first conversation.</p>':'')+btn('+ Group conversation','group');
  }
  function welcome(title,description,glyph='excord') {return `<div class="ec-welcome">${icon(glyph)}<div class="ec-eyebrow" style="margin-top:20px">EXCORD / EXOTIC COMMUNITY</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;}
  function paintPage() {
    $('#ec-title').textContent=tab==='saved'?'Saved messages':tab==='friends'?'Friends':tab==='discover'?'Discover':tab==='about'?'Release guide':'Welcome to Excord';
    $('#ec-topic').textContent='One Exotic account. A space to talk, plan and play.';
    $('#ec-head-actions').innerHTML=btn('Add friend','add-friend', '',true);
    $('#ec-composer').innerHTML='';
    $('#ec-members').innerHTML=`<div class="ec-eyebrow">YOUR SPACE</div><div class="ec-card"><h3>Make it yours.</h3><p>Create a server for your squad, join a community, or start a private conversation with friends.</p></div><div class="ec-eyebrow">ACCOUNT</div><p class="ec-empty">Registered Exotic account<br>@${esc(data.me.username)}<br>No separate sign-in needed.</p>`;
    const scroll=$('#ec-scroll');
    if(tab==='saved') {scroll.innerHTML=welcome('Keep the good stuff.','Messages you save are private to you. Removed server or group access also removes these items from view.','bookmark')+'<div id="ec-saved-list">Loading saved messages…</div>';loadSaved();
    } else if(tab==='friends') {
      scroll.innerHTML=welcome('Better with your people.','Friend requests and conversations are shared across Excord sessions. Private conversations require an accepted friend request.','users')+
        `<div class="ec-actions">${btn('Add friend','add-friend','',true)}${btn('New group','group')}</div>`+
        (data.friends.map(f=>`<div class="ec-card ec-row">${avatar(f.peer_username)}<div class="ec-grow"><strong>@${esc(f.peer_username)}</strong><p>${esc(f.status==='pending'?(f.addressee_id===data.me.id?'Incoming request':'Request sent'):f.status==='blocked'?'Messaging blocked':'Friend')}</p></div><div class="ec-actions">${f.status==='accepted'?btn('Message','dm',`data-id="${f.peer_id}"`):f.status==='pending'&&f.addressee_id===data.me.id?btn('Accept','friend',`data-id="${f.id}" data-decision="accept"`,true):''}${f.status!=='blocked'?btn('Block','friend',`data-id="${f.id}" data-decision="block"`):''}${f.status!=='blocked'||f.requester_id===data.me.id?btn(f.status==='blocked'?'Unblock':'Remove','friend',`data-id="${f.id}" data-decision="remove"`):''}</div></div>`).join('')||'<div class="ec-empty">No friends or requests yet. Add someone using their registered Exotic username.</div>');
    } else if(tab==='about') {
      scroll.innerHTML=welcome('Built for your community.','Excord is an independent community space for Exotic accounts, not an official Discord client.','card')+`<div class="ec-card"><h3>Available now</h3><p>Servers, invites, text and announcement channels, owner-private channels, forums and discussions, friends, private and group messages, replies, message editing and deletion, reactions, 24-hour polls, owner-managed pins, full-history search, saved messages, events with RSVPs, channel categories and settings, thread archiving, unread counts, typing indicators, group management, profile settings, AutoMod keywords, bans and owner audit history.</p></div><div class="ec-card"><h3>Not in this release</h3><p>Voice/video calls, screen sharing, file uploads, bots, role hierarchies, paid subscriptions, boosts, external integrations and mobile push notifications are not available.</p><p>Updates refresh every six seconds while this screen is open. Search scans channel history and returns up to 50 matches. Saved messages remain subject to channel access permissions. Older messages can be loaded in history.</p></div>`;
    } else if(tab==='discover') {scroll.innerHTML=welcome('Find your next community.','Only communities that choose public discovery are listed.','compass')+'<div id="ec-discovery">Loading communities…</div>';loadDiscovery();}
    else {
      scroll.innerHTML=welcome(`A place for your next great run.`,`Welcome, ${data.me.display_name||data.me.username}. Meet your squad between stages, trade Brawl strategies, and build a community that feels like yours.`)+
        `<div class="ec-chips"><span class="ec-chip">${data.servers.length} joined communities</span><span class="ec-chip">${data.friends.filter(f=>f.status==='accepted').length} friends</span><span class="ec-chip">Same Exotic account</span></div><div class="ec-actions">${btn('Find your friends','friends','',true)}${btn('Create a server','create-server')}${btn('Explore communities','discover')}</div>`+
        data.servers.map(s=>`<div class="ec-card ec-row">${avatar(s.name)}<div class="ec-grow"><h3>${esc(s.name)}</h3><p>${esc(s.description||'A space for your community.')} · ${s.member_count} members</p></div>${btn('Open','server',`data-id="${s.id}"`)}</div>`).join('');
    }
    status('');
  }
  async function loadDiscovery() {
    try{const r=await api('discover');const el=$('#ec-discovery');if(el)el.innerHTML=r.servers.map(s=>`<div class="ec-card ec-row">${avatar(s.name)}<div class="ec-grow"><h3>${esc(s.name)}</h3><p>${esc(s.description)} · ${s.member_count} members</p></div>${btn('Join','join-code',`data-code="${esc(s.invite_code)}"`)}</div>`).join('')||'No public communities yet.';}catch(e){status(e.message);}
  }
  function renderMessage(m) {
    const own=m.author_id===data.me.id;
    const reactions=['heart','fire','check','trophy','eyes'].map(emoji=>{
      const rows=(m.reaction_rows||[]).filter(r=>r.emoji===emoji), mine=rows.some(r=>r.profile_id===data.me.id);
      return btn(`${{heart:'Love',fire:'Fire',check:'Agree',trophy:'GG',eyes:'Eyes'}[emoji]}${rows.length?' '+rows.length:''}`,'react',`data-id="${m.id}" data-emoji="${emoji}" data-remove="${mine?'yes':'no'}" aria-pressed="${mine}"`,mine);
    }).join('');
    const votes=m.votes||[];
    const poll=m.poll?`<div class="ec-poll"><strong>${esc(m.poll.question)}</strong>${m.poll.options.map((o,n)=>btn(`<span>${esc(o)}</span><span>${votes.filter(v=>v.option_index===n).length}</span>`,'vote',`data-id="${m.id}" data-option="${n}"`,votes.some(v=>v.profile_id===data.me.id&&v.option_index===n))).join('')}<p class="ec-reply-note">${votes.length} votes · Closes ${esc(time(m.poll.expiresAt))}</p></div>`:'';
    const replyMessage=messages.find(a=>a.id===m.reply_to_id);
    return `<article class="ec-message" data-message="${m.id}">${avatar(m.author_username)}<div class="ec-message-body"><div class="ec-message-meta"><strong>${esc(m.author_display_name||m.author_username||'Deleted account')}</strong><time datetime="${esc(m.created_at)}">${esc(time(m.created_at))}</time>${m.edited_at?'<small>edited</small>':''}${m.pinned?'<small>pinned</small>':''}</div>${m.reply_to_id?`<div class="ec-reply-note">↳ ${esc(replyMessage?`${replyMessage.author_username}: ${replyMessage.content.slice(0,80)}`:'Reply to an earlier message')}</div>`:''}<div class="ec-message-content">${rich(m.content)}</div>${poll}<div class="ec-message-tools">${reactions}</div><div class="ec-message-tools">${btn('Reply','reply',`data-id="${m.id}"`)}${btn(m.saved?'Unsave':'Save','save',`data-id="${m.id}" data-remove="${m.saved?'yes':'no'}"`)}${btn('Copy','copy-message',`data-id="${m.id}"`)}${own&&!m.poll?btn('Edit','edit',`data-id="${m.id}"`):''}${own||owner()?btn('Delete','delete',`data-id="${m.id}"`):''}${!sid||owner()?btn(m.pinned?'Unpin':'Pin','pin',`data-id="${m.id}"`):''}</div></div></article>`;
  }
  function paintMessages(force=false) {
    const hash=JSON.stringify(messages);if(hash===lastHash&&!force)return;lastHash=hash;
    const scroll=$('#ec-scroll');if(!scroll)return;const nearBottom=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<100,old=scroll.scrollTop;
    const c=currentChannel();
    const isForum=c?.channel_type==='forum';
    scroll.innerHTML=`${!before?welcome(isForum?`Explore ${c?.name}`:`Welcome to ${c?.name||'your conversation'}.`,isForum?'Start a discussion with a clear title. Every topic gets its own conversation.':'This is the beginning of your conversation. Be kind. Make it count.',isForum?'forum':'hash'):''}`+
      (isForum?`<div class="ec-actions">${btn('New discussion','thread','',true)}</div>`+data.channels.filter(t=>t.parent_channel_id===cid).map(t=>`<div class="ec-card ec-row"><strong class="ec-grow">${esc(t.name)}</strong>${btn('Open','channel',`data-id="${t.id}"`)}</div>`).join(''):'')+
      ((hasOlder||before)?`<div class="ec-actions">${hasOlder?btn('Load older messages','older'):''}${before?btn('Back to recent','recent'):''}</div>`:'')+
      (messages.map(renderMessage).join('')||(!isForum?'<div class="ec-empty">No messages yet. Say hello to start the conversation.</div>':''));
    scroll.scrollTop=force&&!before||nearBottom?scroll.scrollHeight:old;
  }
  function paintChannel() {
    if(!channelData)return;
    const c=currentChannel(), unsupported=['voice','stage','media'].includes(c.channel_type);
    $('#ec-title').textContent=(c.channel_type==='dm'?(data.dms.find(d=>d.id===cid)?.peers?.[0]?.username||c.name):c.name);
    $('#ec-topic').textContent=c.topic|| (c.channel_type==='thread'?'Discussion thread':'A conversation for your community.');
    $('#ec-head-actions').innerHTML=btn(icon('search'),'search','aria-label="Search channel history" title="Search channel history"')+btn('Pins','pins')+(sid&&['text','announcement','forum'].includes(c.channel_type)?btn('+ Thread','thread'):'')+(sid&&owner()?btn(icon('settings'),'channel-settings','aria-label="Channel settings" title="Channel settings"'):'')+(c.channel_type==='group_dm'?btn('Group','group-settings'):'');
    $('#ec-members').innerHTML=`<div class="ec-eyebrow">MEMBERS — ${channelData.members.length}</div>`+channelData.members.map(m=>`<div class="ec-member">${avatar(m.display_name||m.username)}<div class="ec-member-info"><strong>${esc(m.display_name||m.username)}</strong><small>${m.is_owner?'Owner · ':''}${esc(m.presence_status==='invisible'?'Offline':m.presence_status)}${m.custom_status_text?' · '+esc(m.custom_status_text):''}</small>${owner()&&m.id!==data.me.id?btn('Ban','ban',`data-id="${m.id}" data-name="${esc(m.username)}"`)+btn('Kick','kick',`data-id="${m.id}" data-name="${esc(m.username)}"`):''}</div></div>`).join('');
    if(unsupported) {
      $('#ec-scroll').innerHTML=welcome('Calls are not available yet.','This channel is reserved for a future media release. No microphone or camera is active. Use a text channel to talk with your community.','headphones');$('#ec-composer').innerHTML='';return;
    }
    lastHash='';paintMessages(true);
    if(c.channel_type==='forum'||c.archived||(c.channel_type==='announcement'&&!owner())) {
      $('#ec-composer').innerHTML=`<p class="ec-reply-note">${c.channel_type==='forum'?'Open or create a discussion to send messages.':c.archived?'This conversation is archived.':'Only the server owner can publish announcements.'}</p>`;return;
    }
    $('#ec-composer').innerHTML=`<form id="ec-send"><div class="ec-compose-box"><div class="ec-reply-note" id="ec-typing" aria-live="polite"></div><div class="ec-reply-note" id="ec-reply"></div><textarea id="ec-input" aria-label="Message" placeholder="Message ${esc(c.name)}" maxlength="4000" rows="2"></textarea><div class="ec-compose-bottom"><small>Enter to send · Shift + Enter for a new line</small>${btn('Poll','poll')}<button type="submit" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--sm">Send</button></div></div></form>`;
  }
  async function refreshData() {data=await api('bootstrap');}
  async function openChannel(id) {
    const n=++generation;status('Opening conversation…');
    const r=await api('channel',{channelId:id});if(!active||n!==generation)return;
    cid=id;sid=r.channel.server_id||null;channelData=r;messages=r.messages;hasOlder=r.messages.length===50;before=null;reply=null;lastHash='';paintShell();
    $('.ec-shell')?.classList.remove('ec-nav-open');status('');markRead();
  }
  async function refreshChannel() {
    if(!cid||!active||busy||modal||before||pollBusy)return;
    pollBusy=true;const saved=cid,n=generation;
    try {const fresh=await api('bootstrap');const r=await api('channel',{channelId:saved});if(n!==generation||saved!==cid||!active)return;const changed=channelData?.channel.archived!==r.channel.archived;data=fresh;channelData=r;messages=r.messages;if(changed)paintChannel();const list=$('.ec-channel-list');if(list)list.innerHTML=sid?renderChannels():renderHomeNav();paintMessages();const typing=$('#ec-typing');if(typing)typing.textContent=(r.typing||[]).length?r.typing.map(t=>t.username).join(', ')+' typing…':'';status('');markRead();}
    catch(e){status(e.message);}finally{pollBusy=false;}
  }
  function page(name) {++generation;cid=null;sid=null;before=null;tab=name;paintShell();}
  async function mutate(action,payload) {await api(action,payload);if(cid){const r=await api('channel',{channelId:cid});channelData=r;messages=r.messages;before=null;paintMessages();}}
  async function handle(action,el) {
    const eid=el?.dataset.id;
    if(await communityAction(action,el))return;
    if(action==='verify'){await window.ExoticAuth.signOut();window.ExoticRouter.navigate('signin');return;}
    if(action==='nav'){$('.ec-shell')?.classList.toggle('ec-nav-open');return;}
    if(['home','friends','about','discover','saved'].includes(action)){await refreshData();page(action);return;}
    if(action==='channel'){await openChannel(eid);return;}
    if(action==='server'){sid=eid;const first=data.channels.find(c=>c.server_id===sid&&!c.parent_channel_id&&c.channel_type==='text')||data.channels.find(c=>c.server_id===sid);if(first)await openChannel(first.id);return;}
    if(action==='profile') {
      const m=data.me;
      dialog('Your Excord profile','Your game username and sign-in stay the same.',input('display','Display name',m.display_name,32)+area('bio','About me',m.bio,220)+input('pronouns','Pronouns',m.pronouns,28).replace(' required','')+input('status','Custom status',m.custom_status_text,80).replace(' required','')+`<label>Presence<select name="presence">${['online','idle','dnd','invisible'].map(p=>`<option ${m.presence_status===p?'selected':''}>${p}</option>`).join('')}</select></label>`,'Save profile',async f=>{await api('profile',{displayName:f.get('display'),bio:f.get('bio'),pronouns:f.get('pronouns'),status:f.get('status'),presence:f.get('presence')});await refreshData();paintShell();});return;
    }
    if(action==='create-server') {
      dialog('Your community starts here.','Create a private-by-default server and invite your people.',input('name','Server name','',48)+area('description','Description')+check('public','List in community discovery'),'Create server',async f=>{const r=await api('create_server',{name:f.get('name'),description:f.get('description'),isPublic:f.has('public')});await refreshData();sid=r.serverId;const c=data.channels.find(c=>c.server_id===sid);await openChannel(c.id);});return;
    }
    if(action==='join') {dialog('Join a community','Paste the invite code shared by a member.',input('code','Invite code','','80'),'Join',async f=>{const r=await api('join',{code:f.get('code')});await refreshData();sid=r.serverId;await handle('server',{dataset:{id:sid}});});return;}
    if(action==='join-code') {const r=await api('join',{code:el.dataset.code});await refreshData();await handle('server',{dataset:{id:r.serverId}});return;}
    if(action==='invite') {dialog('Invite your people','Share this code with registered Exotic players.',`<label>Invite code<input value="${esc(currentServer().invite_code)}" readonly></label>`,'Copy invite',async()=>{await navigator.clipboard.writeText(currentServer().invite_code);status('Invite copied.');});return;}
    if(action==='new-channel') {dialog('Create a channel','Only the server owner can create channels. Private channels are owner-only in this release.',input('name','Channel name','',48)+`<label>Type<select name="type"><option value="text">Text</option><option value="announcement">Announcement</option><option value="forum">Forum</option></select></label>`+area('topic','Topic','',180)+input('slowmode','Slowmode in seconds (0–300)','0',3,'number')+check('private','Owner-private channel'),'Create channel',async f=>{const r=await api('create_channel',{serverId:sid,name:f.get('name'),type:f.get('type'),topic:f.get('topic'),slowmode:f.get('slowmode'),isPrivate:f.has('private')});await refreshData();await openChannel(r.channelId);});return;}
    if(action==='thread') {dialog('Start a discussion','A focused conversation, separate from the channel.',input('name','Discussion title','',90)+area('content','Opening message','',4000),'Start discussion',async f=>{const r=await api('thread',{channelId:cid,name:f.get('name'),content:f.get('content')});await refreshData();await openChannel(r.channelId);});return;}
    if(action==='add-friend') {dialog('Find your people','Use their registered Exotic username, not a display name.',input('username','Username','',20),'Send request',async f=>{await api('friend_request',{username:f.get('username')});await refreshData();page('friends');status('Friend request updated.');});return;}
    if(action==='friend') {await api('friend',{friendId:eid,decision:el.dataset.decision});await refreshData();page('friends');return;}
    if(action==='dm') {const r=await api('dm',{peerIds:[eid]});await refreshData();await openChannel(r.channelId);return;}
    if(action==='group') {
      const friends=data.friends.filter(f=>f.status==='accepted');
      dialog('Bring the squad together.','Choose accepted friends. Everyone in the group can read its messages.',input('name','Group name','Squad',48)+(friends.map(f=>check('peer',`@${f.peer_username}`).replace('name="peer"',`name="peer" value="${f.peer_id}"`)).join('')||'<p>Add and accept a friend request first.</p>'),'Create conversation',async f=>{const r=await api('dm',{peerIds:f.getAll('peer'),name:f.get('name')});await refreshData();await openChannel(r.channelId);});return;
    }
    if(action==='reply') {reply=eid;$('#ec-reply').textContent=`Replying to ${messages.find(m=>m.id===eid)?.author_username||'message'} · ${messages.find(m=>m.id===eid)?.content.slice(0,60)||''}`;$('#ec-input').focus();return;}
    if(action==='edit') {dialog('Edit your message','Changes are marked as edited.',area('content','Message',messages.find(m=>m.id===eid)?.content,4000),'Save',async f=>mutate('edit',{messageId:eid,content:f.get('content')}));return;}
    if(action==='delete') {dialog('Delete this message?','This cannot be undone. Reactions and votes will be deleted too.','','Delete message',async()=>mutate('delete',{messageId:eid}));return;}
    if(action==='pin'){await mutate('pin',{messageId:eid});return;}
    if(action==='react'){await mutate('react',{messageId:eid,emoji:el.dataset.emoji,remove:el.dataset.remove==='yes'});return;}
    if(action==='vote'){await mutate('vote',{messageId:eid,optionIndex:Number(el.dataset.option)});return;}
    if(action==='poll') {dialog('Ask the community','One vote per person. Polls close after 24 hours.',input('question','Question','',180)+area('options','Choices — one per line','',720),'Post poll',async f=>{await mutate('send',{channelId:cid,poll:{question:f.get('question'),options:String(f.get('options')).split('\n')}});});return;}
    if(action==='older') {const r=await api('channel',{channelId:cid,before:messages[0]?.created_at});hasOlder=r.messages.length===50;before=r.messages[0]?.created_at||'older';messages=[...r.messages,...messages];paintMessages(true);return;}
    if(action==='recent') {await openChannel(cid);return;}
    if(action==='search'||action==='pins') {
      dialog(action==='pins'?'Pinned messages':'Search channel history','Search all history; up to 50 matches. Filters: from:username has:poll pinned:true before:2026-10-26 after:2026-01-01.',action==='search'?input('query','Search words and filters','',300):'','Search',async f=>{const r=await api('search',{channelId:cid,query:f.get('query')||'',pinsOnly:action==='pins'});messages=r.messages;hasOlder=false;before='search';paintMessages(true);status(`${messages.length} results. Select Back to recent to return.`);const scroll=$('#ec-scroll');scroll.insertAdjacentHTML('afterbegin',btn('Back to recent','recent'));});return;
    }
    if(action==='settings') {
      const s=currentServer();
      dialog('Server settings','Owner-only settings. Keyword rules apply to new messages and edits.',input('name','Server name',s.name,48)+area('description','Description',s.description)+check('public','List in community discovery',s.is_public)+area('blocked','AutoMod blocked keywords (comma separated)',(s.automod_config?.blockedWords||[]).join(', '),500)+`<div class="ec-actions">${btn('Audit history','audit')}${btn('Banned members','bans')}${btn('Rotate invite','rotate-invite')}${btn('Transfer ownership','transfer')}${btn('Delete server','delete-server')}</div>`,'Save',async f=>{await api('settings',{serverId:sid,name:f.get('name'),description:f.get('description'),isPublic:f.has('public'),blockedWords:f.get('blocked')});await refreshData();paintShell();});return;
    }
    if(action==='audit') {const r=await api('audit',{serverId:sid});dialog('Audit history','Owner-visible administrative actions.',r.logs.map(l=>`<p>${esc(time(l.created_at))} · @${esc(l.actor_username)}<br>${esc(l.action_type)} · ${esc(l.target_label)}</p>`).join('')||'<p>No administrative actions yet.</p>','Done',async()=>{});return;}
    if(action==='ban') {dialog(`Ban @${el.dataset.name}?`,'The member will be removed and their invite access blocked.','','Ban member',async()=>{await api('ban',{serverId:sid,peerId:eid});await openChannel(cid);});return;}
    if(action==='leave') {await api('leave',{serverId:sid});await refreshData();page('home');return;}
    if(action==='delete-server') {const s=currentServer();dialog('Delete this server?','All channels and conversations in this server will be permanently removed. Type the exact server name.',input('confirm','Server name','',48),'Delete server',async f=>{await api('delete_server',{serverId:sid,confirm:f.get('confirm')});await refreshData();page('home');});return;}
  }
  function markRead() {
    if(!active||!cid||document.hidden||before||!messages.length)return;
    api('mark_read',{channelId:cid,readAt:messages[messages.length-1].created_at}).catch(()=>{});
  }
  async function loadSaved() {
    try {const r=await api('saved'),list=$('#ec-saved-list');if(!list)return;
      list.innerHTML=r.items.map(m=>`<div class="ec-card"><div class="ec-eyebrow">${esc(m.channel_name)} · @${esc(m.author_username||'Deleted account')}</div><div class="ec-message-content">${rich(m.content)}</div><p>${esc(m.note||'')} · ${esc(time(m.created_at))}</p><div class="ec-actions">${btn('Open channel','channel',`data-id="${m.channel_id}"`)}${btn('Remove saved message','unsave',`data-id="${m.id}"`)}</div></div>`).join('')||'<div class="ec-empty">No saved messages you can access yet. Use Save on a message to keep it here.</div>';
    }catch(e){status(e.message);}
  }
  async function communityAction(action,el) {
    const eid=el?.dataset.id,c=currentChannel(),s=currentServer();
    if(action==='save') {
      if(el.dataset.remove==='yes'){await mutate('bookmark',{messageId:eid,remove:true});return true;}
      dialog('Save this message','Only you can see your saved messages and notes.',area('note','Private note (optional)','',140),'Save',async f=>mutate('bookmark',{messageId:eid,note:f.get('note')}));return true;
    }
    if(action==='unsave') {await api('bookmark',{messageId:eid,remove:true});await loadSaved();return true;}
    if(action==='copy-message') {await navigator.clipboard.writeText(messages.find(m=>m.id===eid)?.content||'');status('Message copied.');return true;}
    if(action==='member-settings') {
      dialog('Your server profile','Your nickname applies only inside this server. Muting hides unread badges for this server.',input('nickname','Server nickname',s.nickname||'',32).replace(' required','')+check('mute','Mute server unread badges',s.muted_server),'Save',async f=>{await api('member_settings',{serverId:sid,nickname:f.get('nickname'),muted:f.has('mute')});await refreshData();await openChannel(cid);});return true;
    }
    if(action==='channel-settings') {
      dialog('Channel settings','Owner-only. Categories group the sidebar; position controls ordering within categories.',input('name','Name',c.name,48)+area('topic','Topic',c.topic,180)+input('category','Category',c.category_name||'Channels',32)+input('position','Position',c.position||0,3,'number')+input('slowmode','Slowmode seconds (0–300)',c.slowmode_sec||0,3,'number')+check('private','Owner-private channel',c.is_private)+`<div class="ec-actions">${c.channel_type==='thread'?btn(c.archived?'Unarchive thread':'Archive thread','archive'):''}${btn('Delete channel','delete-channel')}</div>`,'Save changes',async f=>{await api('channel_settings',{channelId:cid,name:f.get('name'),topic:f.get('topic'),category:f.get('category'),position:f.get('position'),slowmode:f.get('slowmode'),isPrivate:f.has('private')});await refreshData();await openChannel(cid);});return true;
    }
    if(action==='archive') {await api('archive',{channelId:cid,archived:!c.archived});closeModal();await refreshData();await openChannel(cid);return true;}
    if(action==='delete-channel') {
      dialog('Delete this channel?','Messages and nested discussions will be permanently removed. The original server channel cannot be deleted.',input('confirm','Type channel name','',48),'Delete channel',async f=>{const serverId=sid;await api('delete_channel',{channelId:cid,confirm:f.get('confirm')});await refreshData();await handle('server',{dataset:{id:serverId}});});return true;
    }
    if(action==='rotate-invite') {
      dialog('Revoke the current invite?','The previous invite code will stop working immediately. Existing members are not removed.','','Replace invite',async()=>{await api('rotate_invite',{serverId:sid});await refreshData();paintShell();status('Invite replaced. Open Invite to copy the new code.');});return true;
    }
    if(action==='transfer') {
      dialog('Transfer server ownership','The new owner gains all owner permissions. You remain a member and lose management access. This cannot be undone by you.',input('username','New owner’s registered username','',20)+input('confirm','Type server name','',48),'Transfer ownership',async f=>{await api('transfer',{serverId:sid,username:f.get('username'),confirm:f.get('confirm')});await refreshData();await openChannel(cid);});return true;
    }
    if(action==='kick') {dialog(`Remove @${el.dataset.name}?`,'The member loses channel access but can rejoin with a valid invite.','','Kick member',async()=>{await api('kick',{serverId:sid,peerId:eid});await openChannel(cid);});return true;}
    if(action==='bans') {
      const r=await api('bans',{serverId:sid});dialog('Banned members','Unbanning allows a person to use a valid invite again.',r.bans.map(p=>`<div class="ec-row"><span class="ec-grow">@${esc(p.username)}</span>${btn('Unban','unban',`data-id="${p.id}"`)}</div>`).join('')||'<p>No banned members.</p>','Done',async()=>{});return true;
    }
    if(action==='unban') {await api('unban',{serverId:sid,peerId:eid});await communityAction('bans',el);return true;}
    if(action==='events') {
      const r=await api('events',{serverId:sid});dialog('Scheduled events','Members can RSVP. Times are shown in your local timezone.',(owner()?`<div class="ec-actions">${btn('+ Schedule event','new-event','',true)}</div>`:'')+(r.events.map(e=>`<div class="ec-card"><h3>${esc(e.title)}</h3><p>${esc(time(e.starts_at))} · ${esc(e.location_label)}</p><p>${esc(e.description)}</p><p>${(e.interested_ids||[]).length} interested</p><div class="ec-actions">${new Date(e.starts_at).getTime()>Date.now()?btn((e.interested_ids||[]).includes(data.me.id)?'Not interested':'Interested','rsvp',`data-id="${e.id}"`,(e.interested_ids||[]).includes(data.me.id)):''}${owner()?btn('Cancel event','cancel-event',`data-id="${e.id}"`):''}</div></div>`).join('')||'<p>No events scheduled yet.</p>'),'Done',async()=>{});return true;
    }
    if(action==='new-event') {
      const local=new Date(Date.now()+3600000-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
      dialog('Schedule an event','Give your community a time and place to meet. This does not create a voice call.',input('title','Event title','',80)+area('description','Description','',220)+input('location','Location or meeting instructions','',100)+input('starts','Start time (your timezone)',local,30,'datetime-local'),'Create event',async f=>{await api('create_event',{serverId:sid,title:f.get('title'),description:f.get('description'),location:f.get('location'),startsAt:new Date(f.get('starts')).toISOString()});status('Event scheduled. Open Events to view it.');});return true;
    }
    if(action==='rsvp') {await api('rsvp',{eventId:eid});await communityAction('events',el);return true;}
    if(action==='cancel-event') {dialog('Cancel this event?','The event and its RSVP list will be deleted.','','Cancel event',async()=>{await api('delete_event',{eventId:eid});status('Event cancelled.');});return true;}
    if(action==='group-settings') {
      dialog('Group conversation','Leaving removes your access to this conversation’s history. Only the group creator can rename it.',c.created_by===data.me.id?input('name','Group name',c.name,48):'<p>You are a group member.</p>',c.created_by===data.me.id?'Rename group':'Done',async f=>{if(c.created_by===data.me.id){await api('group_settings',{channelId:cid,name:f.get('name')});await refreshData();await openChannel(cid);}});
      $('.ec-form',modal).insertAdjacentHTML('afterbegin',`<div class="ec-actions">${btn('Leave group','group-leave')}</div>`);return true;
    }
    if(action==='group-leave') {dialog('Leave this group?','You will lose access to the conversation and its history.','','Leave group',async()=>{await api('group_leave',{channelId:cid});await refreshData();page('home');});return true;}
    return false;
  }

  async function send(form) {
    if(busy)return;const el=$('#ec-input'),content=el.value.trim();if(!content)return;
    busy=true;$('[type=submit]',form).disabled=true;
    try{await mutate('send',{channelId:cid,content,replyToId:reply});el.value='';reply=null;$('#ec-reply').textContent='';status('');$('#ec-scroll').scrollTop=$('#ec-scroll').scrollHeight;}
    catch(e){status(e.message);}finally{busy=false;$('[type=submit]',form).disabled=false;el.focus();}
  }
  async function enter() {
    active=true;cid=null;sid=null;channelData=null;tab='home';generation++;
    root.innerHTML='<div class="ec-card"><h2>Opening Excord…</h2><p>Checking your account.</p></div>';
    try{await refreshData();if(!active)return;paintShell();clearInterval(timer);timer=setInterval(async()=>{if(cid){refreshChannel();return;}if(!active||modal||pollBusy)return;pollBusy=true;try{const prev=JSON.stringify(data);await refreshData();if(active&&!cid&&JSON.stringify(data)!==prev)paintShell();}catch(e){status(e.message);}finally{pollBusy=false;}},6000);}catch(e){root.innerHTML=`<div class="ec-card"><h2>Excord is unavailable</h2><p>${esc(e.message)}</p>${btn('Try again','retry')} ${btn('Verify game sign-in','verify')}</div>`;}
  }
  document.addEventListener('DOMContentLoaded',()=>{
    root=$('#excord-root');
    window.ExoticAuth.subscribe(()=>{const button=$('#menu-btn-excord');if(button){button.disabled=isGuest();$('#menu-excord-label').textContent=isGuest()?'Excord · Registered accounts':'Excord';}if(active&&isGuest()){active=false;clearInterval(timer);root.innerHTML='';closeModal();window.ExoticRouter.navigate('menu');}});
    window.ExoticRouter.onNavigate(route=>{if(route==='excord'&&!isGuest())enter();else{active=false;generation++;clearInterval(timer);closeModal();}});
    document.addEventListener('click',async e=>{const el=e.target.closest('[data-ec]');if(!el||!active||el.dataset.ec==='cancel')return;e.preventDefault();if(el.dataset.ec==='retry'){enter();return;}try{await handle(el.dataset.ec,el);}catch(err){status(err.message);if(modal)$('.ec-dialog-error',modal).textContent=err.message;}});
    root.addEventListener('input',e=>{if(e.target.id==='ec-input'&&e.target.value.trim()&&Date.now()-lastTyping>4000){lastTyping=Date.now();api('typing',{channelId:cid}).catch(()=>{});}});
    root.addEventListener('submit',e=>{if(e.target.id==='ec-send'){e.preventDefault();send(e.target);}});
    document.addEventListener('keydown',e=>{
      if(modal&&e.key==='Escape'){e.preventDefault();closeModal();return;}
      if(modal&&e.key==='Tab'){const list=[...modal.querySelectorAll('button,input,textarea,select')].filter(el=>!el.disabled);const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
      if(active&&e.target.id==='ec-input'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(e.target.closest('form'));}
    });
  });
})();
