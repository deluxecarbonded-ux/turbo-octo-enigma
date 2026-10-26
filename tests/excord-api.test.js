// Integration security suite. Creates real temporary accounts; always deletes them.
// Run against a local server with the project's .env: node tests/excord-api.test.js
const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const base=process.env.EXCORD_TEST_URL||'http://127.0.0.1:8080';
const clients=Array.from({length:4},()=>({key:'excord_test_'+crypto.randomBytes(16).toString('hex'),name:'ec_'+crypto.randomBytes(5).toString('hex')}));
async function call(c,path,body){const r=await fetch(base+path,{method:'POST',headers:{'Content-Type':'application/json','x-exotic-player-id':c.key,...(c.cookie?{Cookie:c.cookie}:{})},body:JSON.stringify(body)});if(r.headers.get('set-cookie'))c.cookie=r.headers.get('set-cookie').split(';')[0];return{status:r.status,...await r.json()};}
const api=(c,action,body={})=>call(c,'/api/excord',{action,...body});
async function ok(c,a,b){const r=await api(c,a,b);assert.equal(r.ok,true,JSON.stringify(r));return r;}
async function deny(c,a,b){const r=await api(c,a,b);assert.equal(r.ok,false,`Expected denial: ${a}`);assert.ok(r.status<500,JSON.stringify(r));}
(async()=>{
 const [a,b,c,g]=clients;
 try {
  for(const u of [a,b,c]){const r=await call(u,'/api/auth/signup',{username:u.name,authMethod:'password',credential:'ExcordTest!Safe42'});assert.equal(r.ok,true,JSON.stringify(r));}
  assert.equal((await call(g,'/api/auth/guest-signup',{})).ok,true);
  await deny(g,'bootstrap');await deny({key:'bad'},'bootstrap');await deny({key:a.key},'bootstrap');await deny({key:b.key,cookie:a.cookie},'bootstrap');
  const am=(await ok(a,'bootstrap')).me,bm=(await ok(b,'bootstrap')).me,cm=(await ok(c,'bootstrap')).me;
  const s=await ok(a,'create_server',{name:'Excord Test Server'});
  const ab=await ok(a,'bootstrap'),srv=ab.servers.find(x=>x.id===s.serverId),ch=ab.channels.find(x=>x.server_id===s.serverId);
  await deny(b,'channel',{channelId:ch.id});await deny(b,'send',{channelId:ch.id,content:'intrusion'});
  await ok(b,'join',{code:srv.invite_code});
  const msg=await ok(a,'send',{channelId:ch.id,content:'Hello **Excord** <script>bad()</script>'});
  await ok(b,'channel',{channelId:ch.id});
  await deny(b,'edit',{messageId:msg.messageId,content:'not mine'});
  await deny(b,'pin',{messageId:msg.messageId});await deny(b,'settings',{serverId:s.serverId,name:'stolen'});
  await ok(b,'react',{messageId:msg.messageId,emoji:'fire'});
  await ok(a,'pin',{messageId:msg.messageId});
  await deny(c,'react',{messageId:msg.messageId,emoji:'fire'});await deny(c,'bookmark',{messageId:msg.messageId});
  const poll=await ok(a,'send',{channelId:ch.id,poll:{question:'Favorite?',options:['Gauntlet','Brawl']}});
  await ok(b,'vote',{messageId:poll.messageId,optionIndex:1});await deny(c,'vote',{messageId:poll.messageId,optionIndex:0});
  const p=await ok(a,'create_channel',{serverId:s.serverId,name:'owner-room',type:'text',isPrivate:true});
  await deny(b,'channel',{channelId:p.channelId});assert.ok(!(await ok(b,'bootstrap')).channels.some(x=>x.id===p.channelId));
  const thread=await ok(a,'thread',{channelId:ch.id,name:'Strategies',content:'Opening thread'});await ok(b,'send',{channelId:thread.channelId,content:'A real reply'});
  await ok(a,'friend_request',{username:b.name});const f=(await ok(b,'bootstrap')).friends.find(x=>x.peer_id===am.id);
  await ok(b,'friend',{friendId:f.id,decision:'accept'});
  const dm=await ok(a,'dm',{peerIds:[bm.id]});await ok(a,'send',{channelId:dm.channelId,content:'Private'});
  await ok(b,'channel',{channelId:dm.channelId});await deny(c,'channel',{channelId:dm.channelId});
  await deny(a,'dm',{peerIds:[cm.id]});
  await ok(b,'friend',{friendId:f.id,decision:'block'});await deny(a,'send',{channelId:dm.channelId,content:'bypass'});await deny(a,'dm',{peerIds:[bm.id]});await deny(a,'friend',{friendId:f.id,decision:'remove'});
  await ok(a,'settings',{serverId:s.serverId,name:srv.name,blockedWords:'blockedword'});
  await deny(b,'send',{channelId:ch.id,content:'blockedword'});
  await deny(a,'edit',{messageId:msg.messageId,content:'blockedword'});
  const slow=await ok(a,'create_channel',{serverId:s.serverId,name:'slow-room',type:'text',slowmode:60});
  const race=await Promise.all([api(b,'send',{channelId:slow.channelId,content:'first'}),api(b,'send',{channelId:slow.channelId,content:'second'})]);
  assert.equal(race.filter(r=>r.ok).length,1,'Slowmode must reject concurrent bypass');
  await ok(a,'audit',{serverId:s.serverId});await deny(b,'audit',{serverId:s.serverId});
  await ok(a,'ban',{serverId:s.serverId,peerId:bm.id});await deny(b,'join',{code:srv.invite_code});await deny(b,'channel',{channelId:ch.id});
  await deny(g,'create_server',{name:'Guest bypass'});
  const oldCookie=c.cookie;
  await call(c,'/api/auth/signout',{});
  const signed=await call(c,'/api/auth/signin',{username:c.name,authMethod:'password',credential:'ExcordTest!Safe42'});assert.equal(signed.ok,true);
  await deny({key:c.key,cookie:oldCookie},'bootstrap');await ok(c,'bootstrap');
  console.log('EXCORD_API_SECURITY_TESTS_PASSED');
 } finally {
  for(const u of clients){try{await call(u,'/api/auth/delete-account',{});}catch(e){console.error('Cleanup needed:',u.name);}}
 }
})().catch(e=>{console.error(e);process.exitCode=1;});
