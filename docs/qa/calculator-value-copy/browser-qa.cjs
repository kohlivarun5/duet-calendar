const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.DUET_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'evidence');
fs.mkdirSync(out, {recursive: true});
const sent = [];
const failures = [];
const checks = [];
let phase = 'treatment';
let enabled = true;
let now = new Date().toISOString();
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
(async () => {
 const browser = await chromium.launch({executablePath: process.env.DUET_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 // Simulate an eligible browser while intercepting every analytics request.
 const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true,
   userAgent:'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36'});
 await context.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', {get:()=>false}); });
 await context.route('**/*', async route => {
   const u = new URL(route.request().url());
   if (u.hostname === 'api2.amplitude.com') {
     const body = route.request().postDataJSON(); sent.push(...body.events);
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({code:200,events_ingested:body.events.length})});
   }
   if (u.hostname === 'cdn.jsdelivr.net' && u.pathname === '/npm/jspdf@2.5.1/dist/jspdf.umd.min.js') return route.continue();
   if (u.hostname === 'apps.apple.com') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Intercepted App Store navigation</title>'});
   if (u.hostname !== 'duetcalendar.com') return route.abort();
   const rel = decodeURIComponent(u.pathname).replace(/^\//,'');
   const file = path.join(root, rel.endsWith('/') ? rel+'index.html' : rel);
   if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:'not found'});
   let body = fs.readFileSync(file);
   if (rel === 'assets/js/calculator-experiment-config.js') {
     body = Buffer.from(body.toString().replaceAll('enabled: false', 'enabled: '+enabled)
       .replace('reportingVerified: false','reportingVerified: true').replace('projectId: ""','projectId: "123456"')
       .replace('apiKey: ""','apiKey: "'+ 'a'.repeat(32)+'"').replace('phase: "control"','phase: "'+phase+'"'));
   }
   return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body});
 });
 const page = await context.newPage(); page.on('pageerror', e=>failures.push(e.message));
 const url='https://duetcalendar.com/custody-schedule-calculator/';
 async function open(query='') { await page.goto(url+query); await page.waitForFunction(()=>document.querySelector('.calendar-cell')); }
 await open();
 assert.equal(sent.length,0);
 await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded(); await page.waitForTimeout(200);
 assert.equal(sent.length,0); checks.push('Automatic result view excluded');
 await page.locator('[name=parentA]').fill('Synthetic Parent A');
 await page.locator('[name=childName]').fill('Synthetic Child');
 await page.getByRole('button',{name:'Generate schedule',exact:true}).click();
 await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded();
 await page.waitForFunction(()=>sessionStorage.getItem('duet.calculator.pilot.session.v1')?.includes('phases'));
 await page.waitForTimeout(300);
 assert.equal(sent.filter(e=>e.event_type==='calculator_result_viewed').length,1);
 checks.push('Intentional generation plus visible result creates one exposure');
 for(const width of [320,390,768,1440]) {
   await page.setViewportSize({width,height:1000});
   await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded();
   await page.locator('[data-calculator-result-offer]').evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-130));
   assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('[data-calculator-result-offer]').screenshot({path:path.join(out,`treatment-${width}.png`)});
   checks.push(`Treatment visible without horizontal overflow at ${width}px`);
 }
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 const download=await downloadPromise; await download.saveAs(path.join(out,'synthetic-calendar.pdf'));
 assert.ok(fs.statSync(path.join(out,'synthetic-calendar.pdf')).size>1000);
 checks.push('Real existing jsPDF export downloaded with synthetic inputs');
 await page.locator('[data-cta-location=calculator-result]').click(); await page.waitForURL(/apps\.apple\.com/);
 assert.equal(new URL(page.url()).searchParams.get('ct'),'duet_calc_value_t_202609');
 assert.equal(new URL(page.url()).searchParams.get('ppid'),'87fdba48-108d-4ed2-8710-4772189f6bb2');
 const clicks=sent.filter(e=>e.event_type==='app_store_clicked'); assert.equal(clicks.at(-1).event_properties.result_exposed,true);
 assert.equal(new Set(sent.filter(e=>e.event_type==='calculator_result_viewed').map(e=>e.insert_id)).size,1);
 checks.push('Qualified result click preserves product page and repeats the same exposure ID');
 assert.ok(!JSON.stringify(sent).includes('Synthetic')); checks.push('Intercepted analytics omit calculator names and inputs');
 const count=sent.length;
 await open('?gclid=synthetic-paid'); assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),false);
 await page.getByRole('button',{name:'Generate schedule',exact:true}).click(); await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded();
 await page.locator('[data-cta-location=calculator-result]').click(); await page.waitForURL(/apps\.apple\.com/);
 assert.equal(new URL(page.url()).searchParams.get('ct'),'duet_google_search_202607'); assert.equal(sent.length,count);
 checks.push('Paid traffic retains copy and destination and is excluded from pilot');
 enabled=false; await open(); assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),false);
 await page.getByRole('button',{name:'Generate schedule',exact:true}).click(); assert.equal(sent.length,count);
 checks.push('Committed disabled configuration retains existing experience');
 enabled=true; phase='control'; await open(); assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),false);
 await page.getByRole('button',{name:'Generate schedule',exact:true}).click(); await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded(); await page.waitForTimeout(250);
 await page.locator('[data-cta-location=calculator-result]').click(); await page.waitForURL(/apps\.apple\.com/);
 assert.equal(new URL(page.url()).searchParams.get('ct'),'duet_calc_value_c_202609'); checks.push('Separate control phase token and exposure');
 assert.deepEqual(failures,[]);
 const hashFiles=['assets/js/calculator-experiment.js','assets/js/calculator-experiment-config.js','assets/js/calculator-analytics.js','assets/js/site.js','assets/js/custody-calculator.js','custody-schedule-calculator/index.html','styles.css'];
 const receipt={capturedAtUTC:now,browser:browser.version(),scope:'Local source mapped to production host; all analytics and App Store navigation intercepted. This is not live ingestion or deployment.',checks,sourceSHA256:Object.fromEntries(hashFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),interceptedEventProperties:sent.map(e=>({name:e.event_type,properties:e.event_properties}))};
 fs.writeFileSync(path.join(out,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 await browser.close(); console.log(`PASS: ${checks.length} browser checks; screenshots and receipt saved.`);
})().catch(e=>{console.error(e);process.exit(1);});
