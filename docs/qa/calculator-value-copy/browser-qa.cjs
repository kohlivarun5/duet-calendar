const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const {chromium} = require(process.env.DUET_PLAYWRIGHT_PATH || 'playwright');
const root = path.resolve(__dirname, '../../..');
const out = path.join(__dirname, 'evidence');
const checks = [], failures = [], amplitudeRequests = [];
const mime = {'.js':'text/javascript','.css':'text/css','.html':'text/html','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml'};
(async () => {
 const browser = await chromium.launch({executablePath: process.env.DUET_CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try {
 const context = await browser.newContext({viewport:{width:390,height:844},acceptDownloads:true});
 await context.route('**/*', async route => {
   const u = new URL(route.request().url());
   if (u.hostname === 'amplitude.com' || u.hostname.endsWith('.amplitude.com')) amplitudeRequests.push(u.hostname);
   if (u.hostname === 'cdn.jsdelivr.net' && u.pathname === '/npm/jspdf@2.5.1/dist/jspdf.umd.min.js') return route.continue();
   if (u.hostname === 'apps.apple.com') return route.fulfill({status:200,contentType:'text/html',body:'<!doctype html><title>Intercepted App Store navigation</title>'});
   if (u.hostname !== 'duetcalendar.com') return route.abort();
   const rel = decodeURIComponent(u.pathname).replace(/^\//,'');
   const file = path.join(root, rel.endsWith('/') ? rel+'index.html' : rel);
   if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) return route.fulfill({status:404,body:'not found'});
   return route.fulfill({status:200,contentType:mime[path.extname(file)]||'application/octet-stream',body:fs.readFileSync(file)});
 });
 const page = await context.newPage(); page.on('pageerror', e=>failures.push(e.message));
 const url='https://duetcalendar.com/custody-schedule-calculator/';
 async function open(query='') { await page.goto(url+query); await page.waitForFunction(()=>document.querySelector('.calendar-cell')); }
 async function noTracking() {
   assert.deepEqual(amplitudeRequests,[]);
   assert.equal(await page.evaluate(()=>sessionStorage.length),0);
   assert.equal(await page.evaluate(()=>localStorage.length),0);
   assert.equal(await page.locator('script[src*="calculator-experiment"],script[src*="calculator-analytics"]').count(),0);
 }
 await open();
 assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),true);
 assert.match(await page.locator('[data-calculator-value-copy]').innerText(),/free private calendar/);
 assert.equal(await page.locator('[data-cta-location=calculator-result]').innerText(),'Start free in Duet');
 checks.push('Copy and free-start action visible without analytics activation');
 await page.locator('[name=parentA]').fill('Synthetic Parent A');
 await page.locator('[name=childName]').fill('Synthetic Child');
 await page.getByRole('button',{name:'Generate schedule',exact:true}).click();
 assert.equal(await page.locator('[name=parentA]').inputValue(),'Synthetic Parent A');
 checks.push('Calculator accepts synthetic names and generates calendar');
 for(const width of [320,390,768,1440]) {
   await page.setViewportSize({width,height:1000});
   await page.locator('[data-calculator-result-offer]').scrollIntoViewIfNeeded();
   await page.locator('[data-calculator-result-offer]').evaluate(el=>window.scrollTo(0,window.scrollY+el.getBoundingClientRect().top-130));
   assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),true);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('[data-calculator-result-offer]').screenshot({path:path.join(out,`copy-${width}.png`)});
   checks.push(`Copy and actions visible without horizontal overflow at ${width}px`);
 }
 const downloadPromise=page.waitForEvent('download');
 await page.getByRole('button',{name:'Download PDF',exact:true}).click();
 const download=await downloadPromise; await download.saveAs(path.join(out,'synthetic-calendar.pdf'));
 assert.ok(fs.statSync(path.join(out,'synthetic-calendar.pdf')).size>1000);
 checks.push('Real jsPDF export downloaded with synthetic inputs');
 await noTracking();
 await page.locator('[data-cta-location=calculator-result]').click(); await page.waitForURL(/apps\.apple\.com/);
 assert.equal(new URL(page.url()).searchParams.get('ct'),'duet_web_calc_202609');
 assert.equal(new URL(page.url()).searchParams.get('ppid'),'87fdba48-108d-4ed2-8710-4772189f6bb2');
 checks.push('Organic result click preserves campaign and custom product page');
 for (const [query,token] of [['?gclid=synthetic-paid','duet_google_search_202607'],['?utm_source=google&utm_campaign=duet_google_pmax_20260807','duet_google_pmax_20260807']]) {
   await open(query); assert.equal(await page.locator('[data-calculator-value-copy]').isVisible(),true);
   await page.getByRole('button',{name:'Generate schedule',exact:true}).click(); await noTracking();
   await page.locator('[data-cta-location=calculator-result]').click(); await page.waitForURL(/apps\.apple\.com/);
   assert.equal(new URL(page.url()).searchParams.get('ct'),token);
   assert.equal(new URL(page.url()).searchParams.get('ppid'),'87fdba48-108d-4ed2-8710-4772189f6bb2');
   checks.push(`Existing paid campaign preserved: ${token}`);
 }
 await open(); await page.emulateMedia({media:'print'});
 assert.equal(await page.locator('[data-calculator-result-offer]').isVisible(),false);
 checks.push('Promotional copy and actions omitted from print');
 await noTracking(); checks.push('No Amplitude requests, experiment scripts, or browser storage created');
 assert.deepEqual(failures,[]);
 const hashFiles=['assets/js/site.js','assets/js/custody-calculator.js','custody-schedule-calculator/index.html','styles.css'];
 const receipt={capturedAtUTC:new Date().toISOString(),browser:browser.version(),scope:'Local source mapped to production host; outbound analytics and App Store navigation intercepted. This is not a deployment or conversion-lift claim.',checks,sourceSHA256:Object.fromEntries(hashFiles.map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')])),amplitudeRequests,scriptErrors:failures};
 fs.writeFileSync(path.join(out,'browser-receipt.json'),JSON.stringify(receipt,null,2)+'\n');
 console.log(`PASS: ${checks.length} browser checks; screenshots and receipt saved.`);
 } finally { await browser.close(); }
})().catch(e=>{console.error(e);process.exit(1);});
