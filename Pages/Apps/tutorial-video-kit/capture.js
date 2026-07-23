// capture.js — screenshot REAL app screens using Playwright.
// Usage: node capture.js <appsRoot> <outDir>
// Reads build_config.json (same folder). Writes screenshots/<app>/sNN.png + a manifest.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const APPS_ROOT = process.argv[2];   // absolute path to the Apps folder
const OUT = process.argv[3];         // where to write screenshots
const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, 'build_config.json'), 'utf8'));

async function act(page, a) {
  if (a.type === 'wait') await page.waitForTimeout(a.ms);
  else if (a.type === 'value') await page.evaluate(({sel,text})=>{
      const el=document.querySelector(sel); if(!el) return;
      el.value=text; ['input','change','keyup'].forEach(ev=>el.dispatchEvent(new Event(ev,{bubbles:true})));
    }, {sel:a.sel,text:a.text});
  else if (a.type === 'click') await page.evaluate(sel=>{const el=document.querySelector(sel); if(el) el.click();}, a.sel);
  else if (a.type === 'clickText') await page.evaluate(txt=>{
      const els=[...document.querySelectorAll('button,a,div,span')];
      const el=els.find(e=>e.textContent.trim().toLowerCase().includes(txt.toLowerCase()) && e.offsetParent!==null);
      if(el) el.click();
    }, a.text);
  else if (a.type === 'eval') await page.evaluate(a.code);
  else if (a.type === 'scroll') await page.evaluate(sel=>{const el=document.querySelector(sel); if(el) el.scrollIntoView({block:'start'});}, a.sel);
}

(async () => {
  const browser = await chromium.launch();
  for (const [appId, app] of Object.entries(cfg.apps)) {
    const dir = path.join(OUT, appId); fs.mkdirSync(dir, {recursive:true});
    const manifest = [];
    for (let i=0;i<app.scenes.length;i++){
      const sc = app.scenes[i];
      const rel = sc.file || app.file;
      const url = 'file://' + path.join(APPS_ROOT, rel);
      const ctx = await browser.newContext({viewport:{width:430,height:849},deviceScaleFactor:2,isMobile:true,hasTouch:true});
      const page = await ctx.newPage();
      page.on('pageerror',()=>{}); page.on('console',()=>{});
      try { await page.goto(url,{waitUntil:'domcontentloaded',timeout:20000}); } catch(e){ console.log('goto warn',appId,sc.title,e.message); }
      await page.waitForTimeout(1000);
      for (const a of (sc.actions||[])) await act(page, a);
      await page.waitForTimeout(400);
      const f = path.join(dir, `s${String(i+1).padStart(2,'0')}.png`);
      await page.screenshot({path:f});
      manifest.push({i:i+1, title:sc.title, narr:sc.narr, file:f});
      await ctx.close();
      console.log('shot', appId, sc.title);
    }
    fs.writeFileSync(path.join(dir,'manifest.json'), JSON.stringify({app:appId, scenes:manifest}, null, 2));
  }
  await browser.close();
  console.log('CAPTURE DONE');
})().catch(e=>{console.error(e);process.exit(1)});
