# Snack Quest promo booth

Artwork for a standard promo counter: a counter **80 × 40 × 90 cm (W × D × H)** with a header panel **80 × 25 cm** on two poles, about **2.0 m** tall overall.

## Files for the printer: `print/`

| File | Trim (finished) size | File size incl. bleed | Qty |
|---|---|---|---|
| `header.pdf` | 80 × 25 cm | 82 × 27 cm (1 cm bleed) | 1 |
| `front-counter.pdf` | 80 × 90 cm | 82 × 92 cm (1 cm bleed) | 1 |
| `side-panel.pdf` | 40 × 90 cm | 42 × 92 cm (1 cm bleed) | 2 |
| `table-qr-card-a5.pdf` | A5 landscape, 21 × 14.8 cm | 21.6 × 15.4 cm (3 mm bleed) | 1–2, in an acrylic A5 stand |

- The PDFs are the files to print. The text is vector; the images are embedded.
- The PNGs in the same folder are raster copies of the same artwork: about 150 dpi for the large panels and 254 dpi for the card.
- `proofs/` has the same artwork with the trim line (cyan) and safe area (magenta) drawn on. Don't print these.
- Ask the printer to confirm the sizes against the exact counter you rent or buy, because counters vary by a few centimetres. They should also tell you whether they want more bleed for wrapping the edges.

## Before printing
- The logo source is only 512 × 512 px. Here it's upscaled, which is fine from a few metres away but soft up close. Send the printer the original high-resolution or vector logo if you have one.
- The QR code opens `https://snackquests.shop/boxes?utm_source=booth&utm_medium=event`, which was checked by decoding the rendered files. Scan a printed proof before the full run.
- The prices shown are Deluxe KES 3,500 and Premium KES 5,000. Update them in `src/build.mjs` if they change.

## Editing
`src/build.mjs` generates every panel, and `src/mockup.mjs` builds `booth-mockup.png`. To rebuild, run `npm i` in `src/` with Chromium available, then `node build.mjs && node mockup.mjs`.
