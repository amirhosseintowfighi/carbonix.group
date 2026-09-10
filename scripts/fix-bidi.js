#!/usr/bin/env node
/* ==========================================================================
   CARBONIX — bidi isolation for Latin text in RTL pages
   --------------------------------------------------------------------------
       node scripts/fix-bidi.js

   Marks every fully-Latin leaf element on a dir="rtl" page with dir="ltr".

   Without it, the trailing punctuation of a Latin run is a bidi-neutral
   character at the end of an RTL paragraph and is placed at the visual left:

       YOUR BAR. YOUR WORKFLOW. YOUR BEVERAGE ISLAND.
   renders as
       .YOUR BAR. YOUR WORKFLOW. YOUR BEVERAGE ISLAND

   and @carbonix.group renders as carbonix.group@.

   Why here and not in CSS: a selector cannot ask what script an element's
   text is written in. The one attempt to approximate it — matching links by
   href — set direction on flex containers as well as on text and moved the
   labels on the contact page to the wrong side.

   Why here and not in JS at runtime: the text has to be correct for a
   crawler and with scripting turned off.

   Safe to re-run; elements that already declare a direction are skipped.
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');

const ROOT = path.resolve(__dirname, '..');
process.chdir(ROOT);
const norm = s => s.split(path.sep).join('/');
function walk(d, a = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    if (['.git', 'node_modules', '_source'].includes(e.name) || e.name.startsWith('.')) continue;
    const p = path.join(d, e.name);
    e.isDirectory() ? walk(p, a) : a.push(p);
  }
  return a;
}

const RTL_LETTER = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/;
const LATIN_LETTER = /[A-Za-z]/;
// Leaf elements that carry copy. `a` is included for handles, emails and URLs.
const TAGS = 'h1|h2|h3|h4|p|li|span|a|figcaption|dt|dd|td|th';
// only worth isolating when there is a neutral character bidi could relocate
const NEUTRAL = /[.,;:!?()"'&/@·–—-]/;

let touched = 0, added = 0;
for (const f of walk('.').map(p => norm(p).replace(/^\.\//, '')).filter(f => f.endsWith('.html'))) {
  let h = fs.readFileSync(f, 'utf8');
  if (!/<html[^>]*dir="rtl"/.test(h)) continue;
  const before = h;

  const re = new RegExp('<(' + TAGS + ')\\b([^>]*)>([^<]+)<\\/\\1>', 'g');
  h = h.replace(re, (m, tag, attrs, text) => {
    if (/\bdir=/.test(attrs)) return m;
    const t = text.trim();
    if (t.length < 2) return m;
    if (RTL_LETTER.test(t)) return m;            // mixed or RTL — leave alone
    if (!LATIN_LETTER.test(t)) return m;         // digits or symbols only
    if (!NEUTRAL.test(t)) return m;              // nothing for bidi to move
    added++;
    return '<' + tag + attrs + ' dir="ltr">' + text + '</' + tag + '>';
  });

  if (h !== before) { fs.writeFileSync(f, h); touched++; }
}
console.log('dir="ltr" written to ' + added + ' elements across ' + touched + ' RTL pages');
