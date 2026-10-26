(function () {
  'use strict';
  const $ = (s, el=document) => el.querySelector(s);
  const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = name => `<span class="ec-icon" aria-hidden="true">${window.ExoticIcons.get(name)}</span>`;
  const btn = (label,action,attrs='',primary=false) => `<button type="button" class="ex-pill-btn ex-pill-btn--${primary?'primary':'secondary'} ex-pill-btn--sm" data-ec="${action}" ${attrs}>${label}</button>`;
  const avatar = (name,large=false) => `<span class="ec-avatar ${large?'ec-avatar--large':''}" aria-hidden="true">${esc((name||'?').slice(0,2).toUpperCase())}</span>`;
  let root, data, channelData, sid=null, cid=null, tab='home', active=false, timer, busy=false, generation=0, reply=null, before=null, messages=[], lastHash='', pollBusy=false;
  let modal=null, restoreFocus=null, hasOlder=false;
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
    // Escape before formatting. No raw user HTML, URL attributes or embedded resources.
    return esc(content).replace(/`([^`\n]+)`/g,'<code>$1</code>').replace(/\*\*([^*]+)\*\*/g,'<strong>$1</strong>').replace(/\|\|([^|]+)\|\|/g,'<span tabindex="0" class="ec-spoiler" title="Focus or hover to reveal">$1</span>');
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
      ${server ? `<div class="ec-actions">${btn('Invite','invite')}${owner()?btn('+ Channel','new-channel')+btn('Manage','settings'):btn('Leave','leave')}</div>`:''}
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
    const channels=data.channels.filter(c=>c.server_id===sid);
    return `<div class="ec-eyebrow" style="padding:10px">Channels</div>`+channels.map(c=>btn(`${icon(c.channel_type==='forum'?'forum':c.channel_type==='announcement'?'megaphone':c.channel_type==='voice'?'soundOn':c.channel_type==='stage'?'stage':c.channel_type==='thread'?'thread':'hash')}<span>${esc(c.name)}${c.is_private?' · private':''}</span>`,'channel',`data-id="${c.id}" ${cid===c.id?'aria-current="page"':''}`,cid===c.id)).join('');
  }
  function renderHomeNav() {
    return btn(`${icon('users')} Friends`,'friends')+btn(`${icon('card')} About this release`,'about')+`<div class="ec-eyebrow" style="padding:18px 10px 4px">Direct messages</div>`+
      data.dms.map(d=>btn(`${icon('forum')}<span>${esc(d.channel_type==='dm'?(d.peers?.[0]?.username||'Deleted account'):d.name)}</span>`,'channel',`data-id="${d.id}"`,cid===d.id)).join('')+
      (!data.dms.length?'<p class="ec-empty">Add a friend to start your first conversation.</p>':'')+btn('+ Group conversation','group');
  }
  function welcome(title,description,glyph='excord') {return `<div class="ec-welcome">${icon(glyph)}<div class="ec-eyebrow" style="margin-top:20px">EXCORD / EXOTIC COMMUNITY</div><h1>${esc(title)}</h1><p>${esc(description)}</p></div>`;}
  function paintPage() {
    $('#ec-title').textContent=tab==='friends'?'Friends':tab==='discover'?'Discover':tab==='about'?'Release guide':'Welcome to Excord';
    $('#ec-topic').textContent='One Exotic account. A space to talk, plan and play.';
    $('#ec-head-actions').innerHTML=btn('Add friend','add-friend', '',true);
    $('#ec-composer').innerHTML='';
    $('#ec-members').innerHTML=`<div class="ec-eyebrow">YOUR SPACE</div><div class="ec-card"><h3>Make it yours.</h3><p>Create a server for your squad, join a community, or start a private conversation with friends.</p></div><div class="ec-eyebrow">ACCOUNT</div><p class="ec-empty">Registered Exotic account<br>@${esc(data.me.username)}<br>No separate sign-in needed.</p>`;
    const scroll=$('#ec-scroll');
    if(tab==='friends') {
      scroll.innerHTML=welcome('Better with your people.','Friend requests and conversations are shared across Excord sessions. Private conversations require an accepted friend request.','users')+
        `<div class="ec-actions">${btn('Add friend','add-friend','',true)}${btn('New group','group')}</div>`+
        (data.friends.map(f=>`<div class="ec-card ec-row">${avatar(f.peer_username)}<div class="ec-grow"><strong>@${esc(f.peer_username)}</strong><p>${esc(f.status==='pending'?(f.addressee_id===data.me.id?'Incoming request':'Request sent'):f.status==='blocked'?'Messaging blocked':'Friend')}</p></div><div class="ec-actions">${f.status==='accepted'?btn('Message','dm',`data-id="${f.peer_id}"`):f.status==='pending'&&f.addressee_id===data.me.id?btn('Accept','friend',`data-id="${f.id}" data-decision="accept"`,true):''}${f.status!=='blocked'?btn('Block','friend',`data-id="${f.id}" data-decision="block"`):''}${f.status!=='blocked'||f.requester_id===data.me.id?btn(f.status==='blocked'?'Unblock':'Remove','friend',`data-id="${f.id}" data-decision="remove"`):''}</div></div>`).join('')||'<div class="ec-empty">No friends or requests yet. Add someone using their registered Exotic username.</div>');
    } else if(tab==='about') {
      scroll.innerHTML=welcome('Built for your community.','Excord is an independent community space for Exotic accounts, not an official Discord client.','card')+`<div class="ec-card"><h3>Available now</h3><p>Servers, invites, text and announcement channels, owner-private channels, forums and discussions, friends, private and group messages, replies, message editing and deletion, reactions, 24-hour polls, owner-managed pins, recent-message search, profile settings, AutoMod keywords, bans and owner audit history.</p></div><div class="ec-card"><h3>Not in this release</h3><p>Voice/video calls, screen sharing, file uploads, bots, role hierarchies, paid subscriptions, boosts, external integrations and mobile push notifications are not available. Voice and Stage channel names are organizational placeholders and do not open calls.</p><p>Updates refresh every six seconds while this screen is open. Search covers the most recent 50 messages in the selected channel. Older messages can be loaded in history.</p></div>`;
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
    return `<article class="ec-message" data-message="${m.id}">${avatar(m.author_username)}<div class="ec-message-body"><div class="ec-message-meta"><strong>${esc(m.author_display_name||m.author_username||'Deleted account')}</strong><time datetime="${esc(m.created_at)}">${esc(time(m.created_at))}</time>${m.edited_at?'<small>edited</small>':''}${m.pinned?'<small>pinned</small>':''}</div>${m.reply_to_id?`<div class="ec-reply-note">↳ ${esc(replyMessage?`${replyMessage.author_username}: ${replyMessage.content.slice(0,80)}`:'Reply to an earlier message')}</div>`:''}<div class="ec-message-content">${rich(m.content)}</div>${poll}<div class="ec-message-tools">${reactions}</div><div class="ec-message-tools">${btn('Reply','reply',`data-id="${m.id}"`)}${own&&!m.poll?btn('Edit','edit',`data-id="${m.id}"`):''}${own||owner()?btn('Delete','delete',`data-id="${m.id}"`):''}${!sid||owner()?btn(m.pinned?'Unpin':'Pin','pin',`data-id="${m.id}"`):''}</div></div></article>`;
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
    $('#ec-head-actions').innerHTML=btn(icon('search'),'search','aria-label="Search recent messages" title="Search recent messages"')+btn('Pins','pins')+(sid&&['text','announcement','forum'].includes(c.channel_type)?btn('+ Thread','thread'):'');
    $('#ec-members').innerHTML=`<div class="ec-eyebrow">MEMBERS — ${channelData.members.length}</div>`+channelData.members.map(m=>`<div class="ec-member">${avatar(m.display_name||m.username)}<div class="ec-member-info"><strong>${esc(m.display_name||m.username)}</strong><small>${m.is_owner?'Owner · ':''}${esc(m.presence_status==='invisible'?'Offline':m.presence_status)}${m.custom_status_text?' · '+esc(m.custom_status_text):''}</small>${owner()&&m.id!==data.me.id?btn('Ban','ban',`data-id="${m.id}" data-name="${esc(m.username)}"`):''}</div></div>`).join('');
    if(unsupported) {
      $('#ec-scroll').innerHTML=welcome('Calls are not available yet.','This channel is reserved for a future media release. No microphone or camera is active. Use a text channel to talk with your community.','headphones');$('#ec-composer').innerHTML='';return;
    }
    lastHash='';paintMessages(true);
    if(c.channel_type==='forum'||c.archived||(c.channel_type==='announcement'&&!owner())) {
      $('#ec-composer').innerHTML=`<p class="ec-reply-note">${c.channel_type==='forum'?'Open or create a discussion to send messages.':c.archived?'This conversation is archived.':'Only the server owner can publish announcements.'}</p>`;return;
    }
    $('#ec-composer').innerHTML=`<form id="ec-send"><div class="ec-compose-box"><div class="ec-reply-note" id="ec-reply"></div><textarea id="ec-input" aria-label="Message" placeholder="Message ${esc(c.name)}" maxlength="4000" rows="2"></textarea><div class="ec-compose-bottom"><small>Enter to send · Shift + Enter for a new line</small>${btn('Poll','poll')}<button type="submit" class="ex-pill-btn ex-pill-btn--primary ex-pill-btn--sm">Send</button></div></div></form>`;
  }
  async function refreshData() {data=await api('bootstrap');}
  async function openChannel(id) {
    const n=++generation;status('Opening conversation…');
    const r=await api('channel',{channelId:id});if(!active||n!==generation)return;
    cid=id;sid=r.channel.server_id||null;channelData=r;messages=r.messages;hasOlder=r.messages.length===50;before=null;reply=null;lastHash='';paintShell();
    $('.ec-shell')?.classList.remove('ec-nav-open');status('');
  }
  async function refreshChannel() {
    if(!cid||!active||busy||modal||before||pollBusy)return;
    pollBusy=true;const saved=cid,n=generation;
    try {const fresh=await api('bootstrap');const r=await api('channel',{channelId:saved});if(n!==generation||saved!==cid||!active)return;data=fresh;channelData=r;messages=r.messages;const list=$('.ec-channel-list');if(list)list.innerHTML=sid?renderChannels():renderHomeNav();paintMessages();status('');}
    catch(e){status(e.message);}finally{pollBusy=false;}
  }
  function page(name) {++generation;cid=null;sid=null;before=null;tab=name;paintShell();}
  async function mutate(action,payload) {await api(action,payload);if(cid){const r=await api('channel',{channelId:cid});channelData=r;messages=r.messages;before=null;paintMessages();}}
  async function handle(action,el) {
    const eid=el?.dataset.id;
    if(action==='verify'){await window.ExoticAuth.signOut();window.ExoticRouter.navigate('signin');return;}
    if(action==='nav'){$('.ec-shell')?.classList.toggle('ec-nav-open');return;}
    if(['home','friends','about','discover'].includes(action)){await refreshData();page(action);return;}
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
      dialog(action==='pins'?'Pinned messages':'Search recent messages','Search covers the most recent 50 messages in this channel.',action==='search'?input('query','Search words','',100):'','Search',async f=>{const r=await api('search',{channelId:cid,query:f.get('query')||'',pinsOnly:action==='pins'});messages=r.messages;hasOlder=false;before='search';paintMessages(true);status(`${messages.length} results. Select Back to recent to return.`);const scroll=$('#ec-scroll');scroll.insertAdjacentHTML('afterbegin',btn('Back to recent','recent'));});return;
    }
    if(action==='settings') {
      const s=currentServer();
      dialog('Server settings','Owner-only settings. Keyword rules apply to new messages and edits.',input('name','Server name',s.name,48)+area('description','Description',s.description)+check('public','List in community discovery',s.is_public)+area('blocked','AutoMod blocked keywords (comma separated)',(s.automod_config?.blockedWords||[]).join(', '),500)+`<div class="ec-actions">${btn('Audit history','audit')}${btn('Delete server','delete-server')}</div>`,'Save',async f=>{await api('settings',{serverId:sid,name:f.get('name'),description:f.get('description'),isPublic:f.has('public'),blockedWords:f.get('blocked')});await refreshData();paintShell();});return;
    }
    if(action==='audit') {const r=await api('audit',{serverId:sid});dialog('Audit history','Owner-visible administrative actions.',r.logs.map(l=>`<p>${esc(time(l.created_at))} · @${esc(l.actor_username)}<br>${esc(l.action_type)} · ${esc(l.target_label)}</p>`).join('')||'<p>No administrative actions yet.</p>','Done',async()=>{});return;}
    if(action==='ban') {dialog(`Ban @${el.dataset.name}?`,'The member will be removed and their invite access blocked.','','Ban member',async()=>{await api('ban',{serverId:sid,peerId:eid});await openChannel(cid);});return;}
    if(action==='leave') {await api('leave',{serverId:sid});await refreshData();page('home');return;}
    if(action==='delete-server') {const s=currentServer();dialog('Delete this server?','All channels and conversations in this server will be permanently removed. Type the exact server name.',input('confirm','Server name','',48),'Delete server',async f=>{await api('delete_server',{serverId:sid,confirm:f.get('confirm')});await refreshData();page('home');});return;}
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
    root.addEventListener('submit',e=>{if(e.target.id==='ec-send'){e.preventDefault();send(e.target);}});
    document.addEventListener('keydown',e=>{
      if(modal&&e.key==='Escape'){e.preventDefault();closeModal();return;}
      if(modal&&e.key==='Tab'){const list=[...modal.querySelectorAll('button,input,textarea,select')].filter(el=>!el.disabled);const first=list[0],last=list[list.length-1];if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}return;}
      if(active&&e.target.id==='ec-input'&&e.key==='Enter'&&!e.shiftKey){e.preventDefault();send(e.target.closest('form'));}
    });
  });
})();
