const { chromium } = require('playwright');
const BASE='https://jobiest.com', EMAIL='qa2.webtest@jobiest.com', PW=process.env.E2E_PW;
function log(s,ok,d){console.log(`${ok?'PASS':'FAIL'} | ${s} | ${d}`); if(!ok) process.exitCode=1;}
(async()=>{
  const browser=await chromium.launch();
  const page=await (await browser.newContext({viewport:{width:1280,height:800}})).newPage();
  await page.goto(BASE+'/login',{waitUntil:'networkidle'});
  await page.fill('input[type="email"]',EMAIL); await page.fill('input[type="password"]',PW);
  await Promise.all([page.waitForURL(u=>!u.pathname.startsWith('/login'),{timeout:30000}),page.click('button[type="submit"]')]);
  await page.goto(BASE+'/profile',{waitUntil:'networkidle'});
  await page.fill('input[name="full_name"]','QA Webtest Two');
  await page.fill('input[name="roles"]','QA Engineer, Test Automation');
  const [resp]=await Promise.all([
    page.waitForResponse(r=>r.request().method()==='PUT'&&r.url().includes('/api/profile'),{timeout:15000}),
    page.locator('button:has-text("Save profile")').first().click()
  ]);
  log('ui-profile-put', resp.status()===200, `PUT status ${resp.status()}`);
  await page.waitForTimeout(800);
  const prof=await page.evaluate(async()=>{const r=await fetch('/api/profile',{credentials:'same-origin'});return r.json();});
  log('ui-profile-persisted', prof?.profile?.full_name==='QA Webtest Two', `full_name=${JSON.stringify(prof?.profile?.full_name)} roles=${JSON.stringify(prof?.profile?.target_roles)}`);
  const comp=await page.evaluate(async()=>{const r=await fetch('/api/profile/completeness',{credentials:'same-origin'});return r.json();});
  log('ui-completeness', (comp?.percent??0)>=33, `completeness=${comp?.percent}%`);
  await browser.close(); console.log('DONE');
})().catch(e=>{console.error('FATAL:',e.message);process.exit(1);});
