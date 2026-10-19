# Mashiro mascot stickers

Source artwork supplied locally in `/home/mashiro/Pictures/mashiro-emote`.
Mascot artwork by [@fuffi_fufi](https://x.com/fuffi_fufi).
The source files remain untouched.

Each pose ships twice:

- `public/mascot/<pose>.webp`: 384 × 384 still of the first frame, transparent. It is the fallback and the reduced-motion image.
- `public/mascot/anim/<pose>.webp`: 240 × 240 animated WebP, every other source frame with the durations merged so the loop keeps its original length. Lossy quality 50. The seven files total about 2.1 MB and load lazily except intro artwork.

`src/components/Mascot.astro` renders a `<picture>`: the animated source is used only under `prefers-reduced-motion: no-preference`, otherwise the still loads. Images are decorative (empty alt), sized explicitly and never intercept input. Pass `still` to force the still image.

| Pose | Original file | Placement |
| --- | --- | --- |
| `sparkling` | `Mashiro_Sparkling 3_2026-10-18-02-53-30.webp` | Home hero, quiz topic completed |
| `think` | `Mashiro_Think (Confident)_2026-10-18-02-51-29.webp` | Search intro, lesson contents rail |
| `nap` | `Mashiro_Work Nap_2026-10-18-02-50-44.webp` | Footer |
| `surprise` | `Mashiro_Surprise_2026-10-18-02-52-03.webp` | 404 |
| `blep` | `Mashiro_Blep 1_2026-10-18-02-37-19.webp` | Course intro, correct quiz answer |
| `cry` | `Mashiro_Cry 1_2026-10-18-02-57-57.webp` | Wrong quiz answer |
| `six-seven` | `Mashiro_Six Seven_2026-10-18-02-54-15.webp` | Practice intro |
