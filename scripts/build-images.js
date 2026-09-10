#!/usr/bin/env node
/* ==========================================================================
   CARBONIX — responsive image builder
   --------------------------------------------------------------------------
   Drop a full-resolution render into assets/img/_source/ and run:

       node scripts/build-images.js

   For every source it writes the widths the pages ask for, in AVIF and WebP,
   named to the site's existing convention:

       _source/glass-froster.png  ->  glass-froster-420.avif  … -960.webp

   It also prints the <picture> block for each image, including the base64
   LQIP placeholder the cards use as a background while the real file loads.
   Paste that block straight into the page.

   Requires sharp, which is intentionally NOT a project dependency — this is
   a one-off authoring tool, not something the static site needs to build:

       npm install --no-save sharp
   ========================================================================== */
'use strict';
const fs = require('fs'), path = require('path');

let sharp;
try { sharp = require('sharp'); }
catch (e) {
  console.error('sharp is not installed. Run:  npm install --no-save sharp');
  process.exit(1);
}

const ROOT = path.resolve(__dirname, '..');
const SRC = path.join(ROOT, 'assets/img/_source');
const OUT = path.join(ROOT, 'assets/img');
const WIDTHS = [420, 640, 960];
const QUALITY = { avif: 52, webp: 78 };

if (!fs.existsSync(SRC)) {
  fs.mkdirSync(SRC, { recursive: true });
  console.log('Created ' + path.relative(ROOT, SRC) + ' — put your renders in there and run again.');
  process.exit(0);
}

const sources = fs.readdirSync(SRC).filter(f => /\.(png|jpe?g|webp|tiff?)$/i.test(f));
if (!sources.length) {
  console.log('No images in assets/img/_source/. Nothing to do.');
  process.exit(0);
}

(async () => {
  for (const file of sources) {
    const base = file.replace(/\.[^.]+$/, '');
    const input = path.join(SRC, file);
    const meta = await sharp(input).metadata();
    const ratio = meta.height / meta.width;
    console.log('\n' + base + '  (' + meta.width + '×' + meta.height + ')');

    for (const w of WIDTHS) {
      if (w > meta.width) { console.log('  skip ' + w + 'w — source is only ' + meta.width + 'px wide'); continue; }
      for (const fmt of ['avif', 'webp']) {
        const out = path.join(OUT, base + '-' + w + '.' + fmt);
        await sharp(input).resize({ width: w })[fmt]({ quality: QUALITY[fmt] }).toFile(out);
        console.log('  ' + path.basename(out) + '  ' + (fs.statSync(out).size / 1024).toFixed(1) + ' KB');
      }
    }

    // Low-quality placeholder: 20px wide, inlined as a background so the card
    // has colour in it from first paint instead of a grey hole.
    const lqip = await sharp(input).resize({ width: 20 }).webp({ quality: 32 }).toBuffer();
    const big = WIDTHS.filter(w => w <= meta.width).pop();
    const srcset = f => WIDTHS.filter(w => w <= meta.width)
      .map(w => 'PREFIXassets/img/' + base + '-' + w + '.' + f + ' ' + w + 'w').join(', ');

    console.log('\n  <picture>  — replace PREFIX with the page\'s ../ depth, and ALT with real alt text');
    console.log(`  <source type="image/avif" sizes="(max-width:620px) 92vw, 31vw" srcset="${srcset('avif')}">
  <source type="image/webp" sizes="(max-width:620px) 92vw, 31vw" srcset="${srcset('webp')}">
  <img src="PREFIXassets/img/${base}-${big}.webp" alt="ALT"
       width="${big}" height="${Math.round(big * ratio)}"
       loading="lazy" decoding="async"
       style="background-image:url(data:image/webp;base64,${lqip.toString('base64')});background-size:cover;background-position:center">
  </picture>`);
  }
  console.log('\nDone. Source files in assets/img/_source/ are not deployed — keep them for re-encoding.');
})().catch(e => { console.error(e); process.exit(1); });
