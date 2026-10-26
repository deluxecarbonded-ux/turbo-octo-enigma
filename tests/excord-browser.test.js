// Requires Playwright: NODE_PATH=./test-tools/node_modules node tests/excord-browser.test.js
const {chromium}=require('playwright');
const crypto=require('node:crypto');const assert=require('node:assert/strict');const fs=require('node:fs');
const base=process.env.EXCORD_TEST_URL||'http://127.0.0.1:8080';
(async()=>{
 const browser=await chromium.launch({headless:true});const ctx=await browser.newContext({viewport:{width:1440,height:900}});
 const key='ec_browser_'+crypto.randomBytes(16).toString('hex'),username='ec_'+crypto.randomBytes(5).toString('hex');let page,guestCtx;
 const authHeaders={'Content-Type':'application/json','x-exotic-player-id':key};
 try{
  const signup=await ctx.request.post(base+'/api/auth/signup',{headers:authHeaders,data:{username,authMethod:'password',credential:'ExcordTest!Safe42'}});assert.equal((await signup.json()).ok,true);
  await ctx.addInitScript(k=>localStorage.setItem('exotic_runner_client_key_v1',k),key);
  page=await ctx.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base,{waitUntil:'domcontentloaded'});await page.click('#splash-enter-btn');await page.waitForSelector('#view-menu.is-active');
  if(await page.locator('#lb-first-notice-modal').isVisible().catch(()=>false))await page.click('#lb-first-notice-dismiss-btn');
  const dismiss=page.locator('#lb-first-notice-dismiss-btn');if(await dismiss.isVisible())await dismiss.click();
  await page.click('#menu-btn-excord');await page.waitForSelector('.ec-shell');assert.match(await page.locator('#ec-title').innerText(),/Welcome/);
  fs.mkdirSync('artifacts/excord',{recursive:true});await page.screenshot({path:'artifacts/excord/home-dark.png'});
  await page.click('[data-ec="create-server"]');await page.fill('.ec-dialog input[name=name]','Squad Test');await page.fill('.ec-dialog textarea[name=description]','A real test community, removed after testing.');await page.click('.ec-dialog [type=submit]');
  await page.waitForSelector('#ec-input');await page.fill('#ec-input','Hello **Excord** <img src=x onerror="alert(1)">');await page.press('#ec-input','Enter');await page.waitForSelector('.ec-message');
  assert.match(await page.locator('.ec-message-content').innerText(),/<img/);assert.equal(await page.locator('.ec-message-content img').count(),0);
  await page.locator('.ec-message-tools [data-emoji=fire]').click();await page.waitForSelector('[data-emoji=fire][aria-pressed=true]');
  await page.click('[data-ec="poll"]');await page.fill('.ec-dialog [name=question]','Favorite mode?');await page.fill('.ec-dialog [name=options]','Gauntlet\nBrawl');await page.click('.ec-dialog [type=submit]');await page.waitForSelector('.ec-poll');await page.locator('.ec-poll [data-option="1"]').click();await page.waitForSelector('.ec-poll [data-option="1"][class*=primary]');
  // Exercise the second community release through real UI controls.
  const generalId=await page.locator('.ec-channel-list [data-ec="channel"]').first().getAttribute('data-id');
  await page.locator('.ec-message').first().locator('[data-ec="save"]').click();await page.fill('.ec-dialog [name=note]','Keep this strategy');await page.click('.ec-dialog [type=submit]');await page.waitForSelector('.ec-message [data-ec="save"][data-remove="yes"]');
  await page.click('[data-ec="home"]');await page.click('[data-ec="saved"]');await page.waitForSelector('#ec-saved-list .ec-card');assert.match(await page.locator('#ec-saved-list').innerText(),/Keep this strategy/);
  await page.locator('#ec-saved-list [data-ec="channel"]').click();await page.waitForSelector('#ec-input');
  await page.click('[data-ec="events"]');await page.click('[data-ec="new-event"]');await page.fill('.ec-dialog [name=title]','Squad Brawl Night');await page.fill('.ec-dialog [name=location]','Brawl matchmaking');await page.click('.ec-dialog [type=submit]');await page.waitForSelector('.ec-dialog',{state:'detached'});
  await page.click('[data-ec="events"]');await page.waitForSelector('.ec-dialog .ec-card');assert.match(await page.locator('.ec-dialog').innerText(),/Squad Brawl Night/);await page.click('[data-ec="rsvp"]');await page.waitForFunction(()=>document.querySelector('.ec-dialog')?.innerText.includes('1 interested'));
  await page.screenshot({path:'artifacts/excord/events.png'});await page.click('.ec-dialog [type=submit]');
  await page.click('[data-ec="thread"]');await page.fill('.ec-dialog [name=name]','Tactics');await page.fill('.ec-dialog [name=content]','**Important** opening message');await page.click('.ec-dialog [type=submit]');await page.waitForFunction(()=>document.querySelector('#ec-title')?.innerText==='Tactics');
  await page.click('[data-ec="channel-settings"]');await page.click('[data-ec="archive"]');await page.waitForFunction(()=>document.querySelector('#ec-composer')?.innerText.includes('archived'));
  await page.click('[data-ec="channel-settings"]');await page.click('[data-ec="archive"]');await page.waitForSelector('#ec-input');
  await page.locator('.ec-channel-list [data-id="'+generalId+'"]').click();await page.waitForFunction(()=>document.querySelector('#ec-title')?.innerText==='general');await page.waitForSelector('#ec-input');
  await page.screenshot({path:'artifacts/excord/channel-dark.png'});
  await page.evaluate(()=>{ExoticTheme.setColorMode('colored');ExoticTheme.setDimensionMode('3d');});await page.screenshot({path:'artifacts/excord/channel-colored-3d.png'});
  await page.evaluate(()=>ExoticTheme.setMode('light'));await page.screenshot({path:'artifacts/excord/channel-light.png'});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'artifacts/excord/channel-mobile.png'});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.click('[data-ec=nav]');await page.waitForSelector('.ec-shell.ec-nav-open');await page.screenshot({path:'artifacts/excord/mobile-navigation.png'});
  assert.deepEqual(errors,[]);
  guestCtx=await browser.newContext();const gkey='ec_browser_guest_'+crypto.randomBytes(16).toString('hex');
  await guestCtx.request.post(base+'/api/auth/guest-signup',{headers:{...authHeaders,'x-exotic-player-id':gkey},data:{}});
  await guestCtx.addInitScript(k=>localStorage.setItem('exotic_runner_client_key_v1',k),gkey);const gp=await guestCtx.newPage();await gp.goto(base,{waitUntil:'domcontentloaded'});await gp.click('#splash-enter-btn');await gp.waitForSelector('#view-menu.is-active');assert.equal(await gp.locator('#menu-btn-excord').isDisabled(),true);
  await gp.evaluate(()=>ExoticRouter.navigate('excord'));assert.equal(await gp.evaluate(()=>ExoticRouter.getCurrent()),'menu');
  await guestCtx.request.post(base+'/api/auth/delete-account',{headers:{...authHeaders,'x-exotic-player-id':gkey},data:{}});
  console.log('EXCORD_BROWSER_TESTS_PASSED');
 }finally{await ctx.request.post(base+'/api/auth/delete-account',{headers:authHeaders,data:{}});await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
