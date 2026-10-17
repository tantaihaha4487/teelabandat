# ทีละบรรทัด

## Direction
An editorial learning desk for Thai beginners. Material 3 semantic roles, accessible states and adaptive panes inform a custom reading interface. The distinctive detail is a purple chapter index with ruled margin notes connecting code and its explanation. Home is a course index with real lesson links, not a demo gallery.

## Tokens
- Primary #6741A5 / on-primary #FFFFFF; deep purple #352348.
- Paper #FAF6F0; raised paper #F1E9DD; purple container #EFE4F2.
- Main ink #1A1420; supporting ink #51465C; outline #D8CEDD.
- Correct #346044, error #9D342D. Always pair states with text.
- IBM Plex Sans Thai 400/500/600 body, headings, and UI; JetBrains Mono code, with Thai body fallback. Self-host fonts.
- Body 18px, line height 1.9; reading column max 70ch. Control labels can wrap.
- Shapes: 4px code, 8px callouts, 16px chapter panels, pill status labels only. Fine borders rather than general shadows.

## Composition
Unequal desktop columns, numbered chapter rows, generous paper margins. Restrained local line patterns outside dense body text. Lesson shell: chapter sidebar, main article, in-page contents rail. Compact screens collapse navigation into native details. Additions derive from section/lesson metadata, not fixed three-column assumptions.

## Interaction
Native links/buttons/radios/details/dialog. Quiz bank python contains six topics (bank and topic are distinct). Questions use native fieldset/legend and radios; results announced politely. Navigator is a list of buttons, not a tablist. Code notes are inline disclosures plus optional stepping, not hover-only tooltips.

## Motion
Fast feedback 150ms cubic-bezier(.31,.94,.34,1). Spatial continuity 350ms cubic-bezier(.27,1.06,.18,1). Only opacity/transform animate. Immediate semantic updates, cancellation on repeat, reduced-motion static equivalents, no decorative loops or hidden initial content. Do not animate disclosure height.
