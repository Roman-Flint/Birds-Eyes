// Prints the main photo used by each Instagram post, so the daily top-up can avoid
// scheduling two posts with the same photo back to back.
// Usage: node brand/generator/photos.js            (all posts)
//        node brand/generator/photos.js 11-prints  (one post)
// Main photo = `photo`, else the first of `photos`, else the first of `strip`, else "none".
const fs = require('fs');
const path = require('path');
const here = __dirname;
const map = {
  // Hand-made posts in brand/ (not from a batch file).
  'instagram-1-see-your-place': 'home-pool-angled',
  'instagram-2-roof-check': 'shed-roofs-pergola',
  'instagram-3-listings': 'lifestyle-block-wide',
};
global.window = {};
for (const f of fs.readdirSync(here).filter(f => /^batch-\d+\.js$/.test(f)).sort()) {
  eval(fs.readFileSync(path.join(here, f), 'utf8'));
  for (const o of window.BATCH) map[o.id] = o.photo || (o.photos || [])[0] || (o.strip || [])[0] || 'none';
}
const want = process.argv[2];
for (const id of Object.keys(map).sort()) if (!want || id === want) console.log(id + '\t' + map[id]);
