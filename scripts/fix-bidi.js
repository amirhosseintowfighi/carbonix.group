#!/usr/bin/env node
/* ==========================================================================
   CARBONIX — bidi isolation for Latin text in RTL pages
   --------------------------------------------------------------------------
       node scripts/fix-bidi.js

   Wraps fully-Latin leaf text on dir="rtl" pages in <bdi>.

   THE PROBLEM
   A Latin run inside RTL text ends with a bidi-neutral character, which the
   algorithm places at the visual left:

       YOUR BAR. YOUR WORKFLOW. YOUR BEVERAGE ISLAND.
   renders as
       .YOUR BAR. YOUR WORKFLOW. YOUR BEVERAGE ISLAND

   and @carbonix.group renders as carbonix.group@.

   WHY <bdi> AND NOT dir="ltr" ON THE ELEMENT
   Because dir is not only a bidi hint — it sets the inline base direction of
   the box. On a block or flex element that also flips `text-align: start`
   from right to left and moves any ::before marker to the other side. In the
   Beverage Island module list, "Built-in Glass Froster" ended up left-
   aligned with its bullet on the wrong side while every Persian item beside
   it stayed right-aligned. The element was never supposed to change side —
   only its text needed ordering.

   <bdi> is exactly this: an inline box with unicode-bidi: isolate and
   dir="auto", so it infers LTR from its own content, orders it correctly, and
   leaves the parent's direction and alignment alone.

   WHY NOT CSS
   A selector cannot ask what script an element's text is written in. The one
   attempt to approximate it — matching links by href — also hit flex
   containers and moved the labels on the contact page to the wrong side.

   WHY NOT RUNTIME JS
   The text has to be right for a crawler and with scripting off.

   Safe to re-run: text already inside a <bdi> is skipped.
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
const TAGS = 'h1|h2|h3|h4|p|li|span|a|figcaption|dt|dd|td|th';
// only worth isolating when there is a neutral character bidi could relocate
const NEUTRAL = /[.,;:!?()"'&/@·–—-]/;

// Block-level elements: dir here sets alignment, so it is always the wrong
// tool. Inline span/a are left alone — they have no alignment to change.
const BLOCK = 'h1|h2|h3|h4|p|li|td|th|figcaption|dt|dd';

let touched = 0, wrapped = 0, converted = 0;
for (const f of walk('.').map(p => norm(p).replace(/^\.\//, '')).filter(f => f.endsWith('.html'))) {
  let h = fs.readFileSync(f, 'utf8');
  if (!/<html[^>]*dir="rtl"/.test(h)) continue;
  const before = h;

  /* An existing dir="ltr" on a block element is converted rather than kept.
     The dimensions table is the case that showed why: the cells carried
     dir="ltr" so "70 × 70 × 86" would not reorder, but that also left-aligned
     every value while its own column header stayed right-aligned, so the
     header sat over nothing. <bdi> orders the number and leaves the cell
     where the header is. */
  h = h.replace(new RegExp('<(' + BLOCK + ')\\b([^>]*)\\sdir="ltr"([^>]*)>([^<]+)<\\/\\1>', 'g'),
    (m, tag, a1, a2, text) => {
      if (/<bdi/.test(text)) return m;
      converted++;
      return '<' + tag + a1 + a2 + '><bdi>' + text + '</bdi></' + tag + '>';
    });

  const re = new RegExp('<(' + TAGS + ')\\b([^>]*)>([^<]+)<\\/\\1>', 'g');
  h = h.replace(re, (m, tag, attrs, text) => {
    const t = text.trim();
    if (t.length < 2) return m;
    if (RTL_LETTER.test(t)) return m;            // mixed or RTL — leave alone
    if (!LATIN_LETTER.test(t)) return m;         // digits or symbols only
    if (!NEUTRAL.test(t)) return m;              // nothing for bidi to move

    // The element keeps whatever direction it had; only the text is isolated.
    // An existing dir="ltr" is left in place — some of those are the original
    // author's deliberate choice (the phone number block, for one).
    wrapped++;
    return '<' + tag + attrs + '><bdi>' + text + '</bdi></' + tag + '>';
  });

  if (h !== before) { fs.writeFileSync(f, h); touched++; }
}
console.log('<bdi>: ' + wrapped + ' text runs wrapped, ' + converted + ' block dir="ltr" converted, across ' + touched + ' RTL pages');
