#!/usr/bin/env node
/* ==========================================================================
   CARBONIX — broad static audit
   --------------------------------------------------------------------------
       node scripts/audit.js

   Wider and noisier than check-site.js, which is the pre-deploy gate. This
   one looks for things worth a human glance: anchors that point nowhere,
   heading levels that skip, dir="ltr" left on a block element in an RTL page,
   declared image boxes that disagree with the file, over-long titles, form
   fields with no label, and assets nothing references.

   It reports; it changes nothing. Some findings are deliberate — the brand
   SVGs are unreferenced because the logo is inlined, and the redirect stubs
   have no <h1> on purpose. Read it, do not obey it.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');
const norm = s => s.split(path.sep).join('/');
function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_source'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, a) : a.push(p);
  }
  return a;
}
const all = walk('.').map(p => norm(p).replace(/^\.\//, ''));
const exists = new Set(all);
const htmls = all.filter(f => f.endsWith('.html'));
const RTL_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;

const F = {};   // findings
const add = (k, v) => (F[k] = F[k] || []).push(v);

for (const f of htmls) {
  const h = fs.readFileSync(f, 'utf8');
  const isRTL = /<html[^>]*dir="rtl"/.test(h);
  const body = h.slice(h.indexOf('<body'));

  /* --- 1. in-page anchor targets --- */
  const ids = new Set([...h.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]));
  for (const m of h.matchAll(/href="#([^"]+)"/g)) {
    if (!ids.has(m[1])) add('anchor target missing', f + '  ->  #' + m[1]);
  }
  // cross-page anchors: target must exist in the target document
  for (const m of h.matchAll(/href="((?:\.\.\/)*[^"#]+\/)#([^"]+)"/g)) {
    let t = norm(path.normalize(path.join(path.dirname(f), m[1]))) + 'index.html';
    if (!exists.has(t)) continue;
    const th = fs.readFileSync(t, 'utf8');
    if (!new RegExp('\\sid="' + m[2].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"').test(th))
      add('cross-page anchor missing', f + '  ->  ' + m[1] + '#' + m[2]);
  }

  /* --- 2. exactly one h1, one main, one nav landmark label --- */
  const h1s = (body.match(/<h1\b/g) || []).length;
  const isStub = /<meta http-equiv="refresh"/.test(h) || /check.html$/.test(f);
  if (h1s !== 1 && !isStub) add('h1 count != 1', f + '  (' + h1s + ')');
  const mains = (body.match(/<main\b/g) || []).length;
  if (mains !== 1 && !isStub) add('main count != 1', f + '  (' + mains + ')');

  /* --- 3. heading level skips inside #page --- */
  const pi = h.indexOf('<div id="page"');
  if (pi > -1) {
    const page = h.slice(pi, h.indexOf('</main>'));
    let prev = 1;
    for (const m of page.matchAll(/<h([1-6])\b/g)) {
      const lv = +m[1];
      if (lv > prev + 1) add('heading level skip', f + '  h' + prev + ' -> h' + lv);
      prev = lv;
    }
  }

  /* --- 4. blockish dir="ltr" left in an RTL page (the alignment trap) --- */
  if (isRTL) {
    for (const m of h.matchAll(/<(h1|h2|h3|h4|p|li|td|th|figcaption|dt|dd)\b[^>]*\bdir="ltr"[^>]*>/g))
      add('block dir=ltr on RTL page', f + '  ' + m[0].slice(0, 70));
  }

  /* --- 5. images --- */
  for (const m of body.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (!/\balt=/.test(tag)) add('img without alt', f);
    if (!/\bwidth="\d+"/.test(tag) || !/\bheight="\d+"/.test(tag)) add('img without size', f);
    const src = (tag.match(/src="([^"]+)"/) || [])[1];
    if (src && !/^(https?:|data:)/.test(src)) {
      const t = norm(path.normalize(path.join(path.dirname(f), src.split('?')[0])));
      if (!exists.has(t)) add('img src missing', f + '  ->  ' + src);
    }
    // declared box must match the real file's ratio
    const wh = tag.match(/width="(\d+)"\s+height="(\d+)"/);
    const nm = src && src.match(/\/([a-z0-9-]+)-(\d+)\.(webp|avif|jpg|png)$/);
    if (wh && nm && +nm[2] !== +wh[1]) add('img width != filename width', f + '  ' + nm[1] + '-' + nm[2] + ' declared ' + wh[1]);
  }
  // every srcset candidate must exist
  for (const m of body.matchAll(/srcset="([^"]+)"/g)) {
    for (const cand of m[1].split(',')) {
      const u = cand.trim().split(/\s+/)[0];
      if (!u || /^(https?:|data:)/.test(u)) continue;
      const t = norm(path.normalize(path.join(path.dirname(f), u)));
      if (!exists.has(t)) add('srcset candidate missing', f + '  ->  ' + u);
    }
  }

  /* --- 6. structured data --- */
  for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const d = JSON.parse(m[1]);
      const nodes = Array.isArray(d) ? d : [d];
      for (const n of nodes) {
        if (!n['@type']) add('ld+json node without @type', f);
        if (n['@type'] === 'Product' && !n.name) add('Product schema without name', f);
      }
    } catch (e) { add('ld+json invalid', f + '  ' + e.message.slice(0, 50)); }
  }

  /* --- 7. head metadata --- */
  const title = (h.match(/<title>([^<]*)<\/title>/) || [])[1];
  if (!title) add('no title', f);
  else if (title.length > 70) add('title over 70 chars', f + '  (' + title.length + ')');
  const desc = (h.match(/<meta name="description" content="([^"]*)"/) || [])[1];
  if (!desc && !/404\.html$|check\.html$|cold-brew|systems\//.test(f)) add('no meta description', f);
  else if (desc && desc.length > 200) add('description over 200 chars', f + '  (' + desc.length + ')');

  /* --- 8. hreflang reciprocity --- */
  for (const m of h.matchAll(/<link rel="alternate" hreflang="[^"]*" href="https:\/\/carbonix\.group\/([^"]*)"/g)) {
    let t = m[1] === '' ? 'index.html' : (m[1].endsWith('/') ? m[1] + 'index.html' : m[1]);
    if (!exists.has(t)) add('hreflang target missing', f + '  ->  /' + m[1]);
  }

  /* --- 9. forms --- */
  for (const m of body.matchAll(/<(input|select|textarea)\b[^>]*>/g)) {
    const tag = m[0];
    if (/type="hidden"/.test(tag)) continue;
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    if (!id) { add('form field without id', f + '  ' + tag.slice(0, 50)); continue; }
    if (!new RegExp('<label[^>]*for="' + id + '"').test(body) && !/aria-label=/.test(tag))
      add('form field without label', f + '  #' + id);
  }

  /* --- 10. accessibility odds and ends --- */
  /* An element with no text is fine as long as it has an accessible name.
     The card overlay links are deliberately empty — the whole card is the
     hit area — and each carries aria-label. Only a nameless one is a bug. */
  for (const m of body.matchAll(/<a\b[^>]*>\s*<\/a>/g))
    if (!/aria-label=|title=/.test(m[0])) add('link with no accessible name', f + '  ' + m[0].slice(0, 60));
  for (const m of body.matchAll(/<button\b[^>]*>\s*<\/button>/g))
    if (!/aria-label=|title=/.test(m[0])) add('button with no accessible name', f + '  ' + m[0].slice(0, 60));
  for (const m of body.matchAll(/<a\b[^>]*target="_blank"[^>]*>/g))
    if (!/rel="[^"]*noopener/.test(m[0])) add('target=_blank without noopener', f);
  // aria-labelledby / describedby must point at something
  for (const m of h.matchAll(/aria-(?:labelledby|describedby|controls)="([^"]+)"/g))
    for (const ref of m[1].split(/\s+/))
      if (!ids.has(ref)) add('aria reference missing', f + '  ->  ' + ref);

  /* --- 11. RTL page must not contain a stray ltr-only quote pattern --- */
  if (isRTL && /<html[^>]*slang="en"/.test(h)) add('rtl page declaring lang=en', f);
}

/* --- 12. assets referenced nowhere --- */
const referenced = new Set();
for (const f of htmls) {
  const h = fs.readFileSync(f, 'utf8');
  for (const m of h.matchAll(/(?:href|src|srcset|imagesrcset|content)="([^"]+)"/g)) {
    for (const cand of m[1].split(',')) {
      let u = cand.trim().split(/\s+/)[0];
      if (!u) continue;
      // og:image and the JSON-LD point at assets by absolute URL, so those
      // count as references too — without this the whole og/ folder reads as
      // orphaned.
      u = u.replace(/^https?:\/\/carbonix\.group/, '');
      if (/^(https?:|data:|mailto:|tel:|#)/.test(u)) continue;
      const t = u.startsWith('/') ? u.replace(/^\/+/, '') : norm(path.normalize(path.join(path.dirname(f), u.split('#')[0].split('?')[0])));
      referenced.add(t);
    }
  }
}
for (const css of all.filter(f => f.endsWith('.css') || f.endsWith('.webmanifest') || f.endsWith('.json'))) {
  const c = fs.readFileSync(css, 'utf8');
  // url() in CSS, and "src" in the webmanifest's icon list
  for (const m of c.matchAll(/url\(['"]?([^'")]+)['"]?\)|"src":\s*"([^"]+)"/g)) {
    if (m[2]) { referenced.add(m[2].replace(/^\/+/, '')); continue; }
    if (/^data:/.test(m[1])) continue;
    referenced.add(norm(path.normalize(path.join(path.dirname(css), m[1]))));
  }
}
const orphans = all.filter(f =>
  /^assets\/(img|og|brand|files|fonts)\//.test(f) &&
  !f.startsWith('assets/img/_source/') &&
  !/\.md$/.test(f) &&
  !referenced.has(f));
orphans.forEach(o => add('asset referenced nowhere', o));

/* ---------------- report ---------------- */
const order = Object.keys(F).sort((a, b) => F[b].length - F[a].length);
if (!order.length) { console.log('clean — nothing found'); process.exit(0); }
let total = 0;
for (const k of order) {
  const v = F[k]; total += v.length;
  console.log('\n' + k.toUpperCase() + '  (' + v.length + ')');
  [...new Set(v)].slice(0, 10).forEach(x => console.log('   ' + x));
  if (new Set(v).size > 10) console.log('   … ' + (new Set(v).size - 10) + ' more distinct');
}
console.log('\n' + total + ' findings in ' + order.length + ' categories across ' + htmls.length + ' pages');
