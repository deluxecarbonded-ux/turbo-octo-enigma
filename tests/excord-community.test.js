// Real-account integration tests; all temporary accounts and owned data are removed.
const assert=require('node:assert/strict'),crypto=require('crypto');
const base=process.env.EXCORD_TEST_URL||'http://127.0.0.1:8080';
const users=Array.from({length:3},()=>({key:'excord_test_'+crypto.randomBytes(16).toString('hex'),name:'ec_'+crypto.randomBytes(5).toString('hex')}));
async function call(u,path,b){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-exotic-player-id':u.key,...(u.cookie?{Cookie:u.cookie}:{})},body:JSON.stringify(b)});const cookie=r.headers.get('set-cookie');if(cookie)u.cookie=cookie.split(';')[0];return {status:r.status,...await r.json()};}
const api=(u,action,b={})=>call(u,'/api/excord',{action,...b});
async function ok(u,a,b){const r=await api(u,a,b);assert.equal(r.ok,true,`${a}: ${JSON.stringify(r)}`);return r;}
async function deny(u,a,b){const r=await api(u,a,b);assert.equal(r.ok,false,a);assert.ok(r.status<500,JSON.stringify(r));}
(async()=>{const [a,b,c]=users;try{
 for(const u of users){const r=await call(u,'/api/auth/signup',{username:u.name,authMethod:'password',credential:'ExcordTest!Safe42'});assert.equal(r.ok,true);u.profile=(await ok(u,'bootstrap')).me;}
 const s=await ok(a,'create_server',{name:'Community Test'});let boot=await ok(a,'bootstrap');const server=boot.servers.find(x=>x.id===s.serverId),general=boot.channels.find(x=>x.server_id===s.serverId);
 await ok(b,'join',{code:server.invite_code});await ok(c,'join',{code:server.invite_code});
 const msg=await ok(a,'send',{channelId:general.id,content:'Searchable community message'});
 await ok(b,'bookmark',{messageId:msg.messageId,note:'Private personal note'});assert.equal((await ok(b,'saved')).items[0].note,'Private personal note');assert.equal((await ok(a,'saved')).items.length,0);
 assert.equal((await ok(b,'bootstrap')).channels.find(x=>x.id===general.id).unread_count,1);
 await ok(b,'mark_read',{channelId:general.id});assert.equal((await ok(b,'bootstrap')).channels.find(x=>x.id===general.id).unread_count,0);
 await ok(a,'typing',{channelId:general.id});assert.equal((await ok(b,'channel',{channelId:general.id})).typing[0].username,a.name);
 await ok(b,'member_settings',{serverId:server.id,nickname:'Squad Captain',muted:true});
 assert.equal((await ok(a,'channel',{channelId:general.id})).members.find(x=>x.id===b.profile.id).display_name,'Squad Captain');
 const ch=await ok(a,'create_channel',{serverId:server.id,name:'strategy',type:'text'});
 await ok(a,'channel_settings',{channelId:ch.channelId,name:'strategy-room',topic:'Useful tips',category:'Squad HQ',position:5,slowmode:0,isPrivate:false});
 assert.equal((await ok(b,'channel',{channelId:ch.channelId})).channel.category_name,'Squad HQ');
 await deny(b,'channel_settings',{channelId:ch.channelId,name:'stolen'});
 const thread=await ok(a,'thread',{channelId:general.id,name:'Tactics',content:'Thread content'});
 await ok(a,'archive',{channelId:thread.channelId,archived:true});await deny(b,'send',{channelId:thread.channelId,content:'bypass archive'});await deny(b,'archive',{channelId:thread.channelId,archived:false});
 await ok(a,'archive',{channelId:thread.channelId,archived:false});await ok(b,'send',{channelId:thread.channelId,content:'Unarchived reply'});
 const eventBody={serverId:server.id,title:'Brawl Night',description:'Match coordination',location:'Brawl lobby',startsAt:new Date(Date.now()+3600000).toISOString()};
 const ev=(await ok(a,'create_event',eventBody)).events[0];await deny(b,'create_event',eventBody);
 await ok(b,'rsvp',{eventId:ev.id});assert.ok((await ok(c,'events',{serverId:server.id})).events[0].interested_ids.includes(b.profile.id));
 await deny(b,'delete_event',{eventId:ev.id});await ok(a,'delete_event',{eventId:ev.id});
 // Seed temporary history fixtures in this test's real server, then verify search beyond the latest page.
 const fs=require('fs'),{PgWireClient,parsePostgresUrl}=require('../src/server/pgClient');
 const env=Object.fromEntries(fs.readFileSync('.env','utf8').split(/\r?\n/).filter(l=>l&&!l.startsWith('#')).map(l=>{const n=l.indexOf('=');return[l.slice(0,n),l.slice(n+1).replace(/^['"]|['"]$/g,'')];}));
 const fixtureDb=new PgWireClient(parsePostgresUrl(env.SUPABASE_DB_URL.replace(':5432/',':6543/')));await fixtureDb.connect();
 try {await fixtureDb.query(`INSERT INTO public.excord_messages(id,channel_id,author_id,content,created_at)
  SELECT gen_random_uuid()::text,$1,$2,'Temporary history fixture '||n,now()+n*interval '1 microsecond' FROM generate_series(1,55) n`,[general.id,a.profile.id]);}finally{fixtureDb.close();}
 assert.ok(!(await ok(b,'channel',{channelId:general.id})).messages.some(m=>m.id===msg.messageId),'Fixture must push original message past the latest page');
 const search=await ok(b,'search',{channelId:general.id,query:'Searchable from:'+a.name});assert.equal(search.messages[0].id,msg.messageId);
 await ok(a,'pin',{messageId:msg.messageId});assert.equal((await ok(b,'search',{channelId:general.id,query:'pinned:true'})).messages[0].id,msg.messageId);
 const rot=await ok(a,'rotate_invite',{serverId:server.id});await deny(c,'rotate_invite',{serverId:server.id});
 await ok(a,'kick',{serverId:server.id,peerId:c.profile.id});await deny(c,'join',{code:server.invite_code});await ok(c,'join',{code:rot.inviteCode});
 await ok(a,'ban',{serverId:server.id,peerId:c.profile.id});assert.equal((await ok(a,'bans',{serverId:server.id})).bans.length,1);await deny(b,'bans',{serverId:server.id});
 await ok(a,'unban',{serverId:server.id,peerId:c.profile.id});await ok(c,'join',{code:rot.inviteCode});
 await ok(a,'channel_settings',{channelId:general.id,name:general.name,category:'Channels',position:0,slowmode:0,isPrivate:true});assert.equal((await ok(b,'saved')).items.length,0);await deny(b,'search',{channelId:general.id,query:'Searchable'});
 await ok(a,'channel_settings',{channelId:general.id,name:general.name,isPrivate:false});
 await deny(b,'delete_channel',{channelId:ch.channelId,confirm:'strategy-room'});await ok(a,'delete_channel',{channelId:ch.channelId,confirm:'strategy-room'});await deny(b,'channel',{channelId:ch.channelId});
 await deny(b,'transfer',{serverId:server.id,username:c.name,confirm:server.name});await ok(a,'transfer',{serverId:server.id,username:b.name,confirm:server.name});await deny(a,'settings',{serverId:server.id,name:'old-owner'});
 // Accepted-friend group: leaving immediately revokes history access.
 for(const peer of [b,c]){await ok(a,'friend_request',{username:peer.name});const f=(await ok(peer,'bootstrap')).friends.find(x=>x.peer_id===a.profile.id);await ok(peer,'friend',{friendId:f.id,decision:'accept'});}
 const group=await ok(a,'dm',{peerIds:[b.profile.id,c.profile.id],name:'Squad'});
 await deny(b,'group_settings',{channelId:group.channelId,name:'hijack'});await ok(a,'group_settings',{channelId:group.channelId,name:'New squad'});
 await ok(a,'group_leave',{channelId:group.channelId});await deny(a,'channel',{channelId:group.channelId});
 const groupState=await ok(b,'channel',{channelId:group.channelId});assert.ok([b.profile.id,c.profile.id].includes(groupState.channel.created_by));
 console.log('EXCORD_COMMUNITY_FEATURE_TESTS_PASSED');
 }finally{for(const u of users)await call(u,'/api/auth/delete-account',{}).catch(()=>{});}
})().catch(e=>{console.error(e);process.exitCode=1;});
