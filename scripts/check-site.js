#!/usr/bin/env node
/* ==========================================================================
   CARBONIX — build check
   --------------------------------------------------------------------------
   Run from the site root:  node scripts/check-site.js
   Exits non-zero on the first failure, so it works as a pre-deploy gate.

   Every assertion here stands for a bug that actually shipped once. Keep them.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');

const norm = s => s.split(path.sep).join('/');
const walk = (d, acc = []) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, acc) : acc.push(p);
  }
  return acc;
};

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const all = walk('.').map(p => norm(p).replace(/^\.\//, ''));
const exists = new Set(all);
const htmls = all.filter(f => f.endsWith('.html'));

let failures = 0;
function check(name, bad, describe) {
  if (!bad.length) { console.log('  ok   ' + name); return; }
  failures++;
  console.log('  FAIL ' + name + ' (' + bad.length + ')');
  bad.slice(0, 12).forEach(b => console.log('         ' + (describe ? describe(b) : b)));
  if (bad.length > 12) console.log('         … and ' + (bad.length - 12) + ' more');
}

console.log('carbonix — ' + htmls.length + ' pages\n');

/* -- every href/src resolves to a file that exists ---------------------- */
const broken = [];
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8'), base = path.dirname(f);
  for (const m of html.matchAll(/(href|src|srcset)="([^"]+)"/g)) {
    const urls = m[1] === 'srcset'
      ? m[2].split(',').map(s => s.trim().split(/\s+/)[0])
      : [m[2]];
    for (const u of urls) {
      if (!u || /^(https?:|\/\/|mailto:|tel:|#|data:|javascript:)/.test(u)) continue;
      const p = u.split('#')[0].split('?')[0];
      if (!p) continue;
      let t = p.startsWith('/') ? p.replace(/^\/+/, '') : norm(path.normalize(path.join(base, p)));
      if (t.endsWith('/')) t += 'index.html';
      else if (!path.extname(t) && exists.has(t + '/index.html')) t += '/index.html';
      if (!exists.has(t)) broken.push(f + '  ->  ' + u);
    }
  }
}
check('internal links resolve', broken);

/* -- nothing loads from a third party ----------------------------------
   Google Fonts and cdnjs are not reliably reachable from Iran, the primary
   market, and a CDN script with no SRI is a supply-chain hole. Everything
   the pages need is served from this origin. */
const external = [];
for (const f of htmls) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/<(?:script|link)[^>]+(?:src|href)="(https?:\/\/[^"]+)"/g)) {
    if (!/^https:\/\/carbonix\.group/.test(m[1])) external.push(f + '  ->  ' + m[1]);
  }
}
check('no third-party assets', external);

/* -- ids are unique per page (the logo masks collided on 103 pages) ----- */
const dupes = [];
for (const f of htmls) {
  const seen = new Map();
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/\sid="([^"]+)"/g)) {
    seen.set(m[1], (seen.get(m[1]) || 0) + 1);
  }
  for (const [id, n] of seen) if (n > 1) dupes.push(f + '  ->  id="' + id + '" x' + n);
}
check('ids unique per page', dupes);

/* -- robots.txt must never block the stylesheet or the script ----------
   .rv sections start at opacity:0 and only carbonix.js reveals them, so a
   crawler that cannot fetch the JS renders a page of invisible content. */
const robots = fs.readFileSync('robots.txt', 'utf8');
check('robots.txt allows css/js',
  robots.split('\n').filter(l => /^Disallow:\s*\/assets\/(js|css)/i.test(l.trim())));

/* -- language and direction on every page ------------------------------ */
const langless = htmls.filter(f => {
  const m = fs.readFileSync(f, 'utf8').match(/<html([^>]*)>/);
  return !m || !/lang="/.test(m[1]) || !/dir="/.test(m[1]);
});
check('every page has lang + dir', langless);

/* -- images carry alt and intrinsic size (no layout shift) ------------- */
const imgIssues = [];
for (const f of htmls) {
  for (const m of fs.readFileSync(f, 'utf8').matchAll(/<img\b[^>]*>/g)) {
    if (!/\balt=/.test(m[0])) imgIssues.push(f + '  ->  no alt: ' + m[0].slice(0, 60));
    else if (!/\bwidth=/.test(m[0]) || !/\bheight=/.test(m[0])) imgIssues.push(f + '  ->  no size: ' + m[0].slice(0, 60));
  }
}
check('images have alt + width/height', imgIssues);

/* -- sitemap only lists pages that exist and are indexable ------------- */
const locs = [...fs.readFileSync('sitemap.xml', 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
const smBad = [];
for (const loc of locs) {
  const p = loc.replace(/^https?:\/\/[^/]+\//, '');
  const t = p === '' ? 'index.html' : (p.endsWith('/') ? p + 'index.html' : p);
  if (!exists.has(t)) { smBad.push(loc + '  ->  missing'); continue; }
  if (/<meta name="robots"[^>]*noindex/.test(fs.readFileSync(t, 'utf8'))) smBad.push(loc + '  ->  noindex');
}
check('sitemap entries exist and are indexable', smBad);

/* -- pages excluded from the sitemap must say noindex ------------------ */
const inSitemap = new Set(locs.map(l => {
  const p = l.replace(/^https?:\/\/[^/]+\//, '');
  return p === '' ? 'index.html' : (p.endsWith('/') ? p + 'index.html' : p);
}));
check('unlisted pages are noindex',
  htmls.filter(f => f !== 'index.html' && !inSitemap.has(f))
       .filter(f => !/<meta name="robots"[^>]*noindex/.test(fs.readFileSync(f, 'utf8'))));

/* -- the two host configs must not drift apart ------------------------- */
const csp = /Content-Security-Policy/;
check('both host configs set a CSP',
  ['.htaccess', '_headers'].filter(f => !csp.test(fs.readFileSync(f, 'utf8'))));

/* -- every form has the honeypot the script expects -------------------- */
check('forms carry the honeypot',
  htmls.filter(f => {
    const h = fs.readFileSync(f, 'utf8');
    return /data-cx-form=/.test(h) && !/name="cx_website"/.test(h);
  }));

console.log('\n' + (failures ? failures + ' check(s) failed' : 'all checks passed'));
process.exit(failures ? 1 : 0);
