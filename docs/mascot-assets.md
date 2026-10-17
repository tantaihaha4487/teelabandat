# Mashiro mascot stickers

Source artwork supplied locally in `/home/mashiro/Pictures/mashiro-emote`.
The source files remain untouched. Website assets are 384 × 384 WebP stills
exported from the first animation frame, with transparency retained and metadata
removed. The four assets total 66,446 bytes; no animation runtime is loaded.

| Website asset | Original file | Placement |
| --- | --- | --- |
| `sparkling.webp` | `Mashiro_Sparkling 3_2026-10-18-02-53-30.webp` | Home study note |
| `think.webp` | `Mashiro_Think (Confident)_2026-10-18-02-51-29.webp` | Search intro and lesson contents rail |
| `nap.webp` | `Mashiro_Work Nap_2026-10-18-02-50-44.webp` | Footer |
| `surprise.webp` | `Mashiro_Surprise_2026-10-18-02-52-03.webp` | 404 |

`src/components/Mascot.astro` renders decorative images with empty alternative
text, explicit dimensions and lazy loading by default. Intro artwork opts into
eager loading. Stickers never intercept input. The home sticker has a small
pointer hover tilt that becomes static with reduced motion.
