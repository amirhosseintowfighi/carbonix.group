# Source renders

Full-resolution product renders live here. They are **not** deployed — the
build reads them and writes the resized AVIF/WebP files into `assets/img/`.

Name each file after the product slug, then run:

```bash
npm install --no-save sharp
node scripts/build-images.js
```

| filename                | used on                              |
|-------------------------|--------------------------------------|
| `beverage-island.png`   | /products/beverage-island/           |
| `warm-brew-kettles.png` | /products/warm-brew-kettles/         |
| `glass-froster.png`     | /products/glass-froster/ — hero      |
| `glass-froster-trio.png`| /products/glass-froster/ — the three configurations in one frame |

PNG or JPEG, at least 1600px on the long edge. The script writes 420/640/960
in both formats and prints the `<picture>` block to paste into the page.

## lqip-manifest.json

Dimensions and base64 LQIP placeholders for the images that shipped in the
first build, from the original pipeline. Kept because most of those images
have no master here to regenerate from — `build-images.js` prints an LQIP
for anything it encodes itself, so this file only covers the older set.
Moved out of `assets/img/` because nothing at runtime reads it.
