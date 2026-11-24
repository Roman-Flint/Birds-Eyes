// Renders a batch of Instagram posts (1080x1350 JPEGs) into brand/instagram-ads/.
// Usage: node brand/generator/render.js brand/generator/batch-03.js
//
// A batch file sets window.BATCH = [ {id, t, ...}, ... ]. Layouts (t):
//   hero  : photo, h, sub?, chip?, eyebrow?, pos?
//   panel : photo, h, hs?, sub?, ticks?|list?, chip?, ph?, pos?
//   light : photo, h, hs?, sub?, inset?, ipos?, tag?, ticks?, pos?
//   card  : h, hs?, eyebrow?, sub?, steps?|list?|ticks?, strip? (photo names), sh?
//   grid  : photos (4 names), h, hs?, sub?
//   print : photo, h, hs?, eyebrow?, sub?, ribbon? (true adds a Christmas ribbon and bow)
// Photo names are files in assets/photos without "-2048.jpg", e.g. "home-pool-overhead".
// Use <span class="k">...</span> in h for the yellow highlight and <br> for line breaks.
const path = require('path');
const fs = require('fs');
const { chromium } = require('playwright');

const batchFile = process.argv[2];
if (!batchFile) { console.error('Usage: node render.js <batch.js>'); process.exit(1); }
const here = __dirname;
const outDir = path.join(here, '..', 'instagram-ads');
const batchSrc = fs.readFileSync(path.resolve(batchFile), 'utf8');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1400 }, deviceScaleFactor: 1 });
  await page.goto('file://' + path.join(here, 'template.html'));
  await page.addScriptTag({ content: batchSrc });
  const ids = await page.evaluate(() => window.renderAds(window.BATCH));
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1500);
  let problems = 0;
  for (const id of ids) {
    const el = await page.$(`[id="${id}"]`);
    await el.screenshot({ path: path.join(outDir, id + '.jpg'), type: 'jpeg', quality: 90 });
    // Layout check: text must end at least 15px above the footer line, and images must load.
    const r = await page.evaluate((id) => {
      const s = document.getElementById(id);
      const foot = s.querySelector('.foot').getBoundingClientRect().top;
      let bottom = -Infinity;
      s.querySelectorAll('.h,.sub,.list,.ticks,.steps,.chip').forEach(e => {
        const b = e.getBoundingClientRect(); if (b.height) bottom = Math.max(bottom, b.bottom);
      });
      const over = s.scrollWidth > s.clientWidth;
      return { gap: Math.round(foot - bottom), over };
    }, id);
    const ok = r.gap >= 15 && !r.over;
    if (!ok) problems++;
    console.log(`${ok ? 'ok  ' : 'FIX '} ${id}.jpg  (gap above footer ${r.gap}px)`);
  }
  await browser.close();
  if (problems) { console.log(`${problems} post(s) need a shorter headline or text.`); process.exit(2); }
})();
