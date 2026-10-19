# ทีละบรรทัด

## Direction
An expressive, lively learning desk for Thai beginners, built on Material 3 Expressive roles, shapes and adaptive panes. Motion follows the Swiftify reference (swiftify-design-motion skill, source 0602d69): springy hover growth, scalloped edges on hovered artwork, PageHost fade-and-rise between pages and hero handoff of section shapes. Home is a course index with real lesson links, not a demo gallery. Mashiro, the animated mascot, sits beside the reading and never over it.

## Tokens
- Tonal scheme from the brand purple #6741A5, light and dark (follows the OS). Tokens live in `src/styles/global.css` as `--md-*` roles; legacy names (`--primary`, `--paper`, `--ink`…) alias them for the Vue islands.
- Primary purple for the main action and Python, tertiary rose for Git and highlights, secondary lilac for selection and practice. Success and error always pair a container with its on-role and with text.
- Warm paper surfaces (`--md-surface` #FBF7F1) with five container levels. Code stays on a dark surface in both schemes.
- IBM Plex Sans Thai 400–700 and JetBrains Mono, self-hosted. Display headlines are heavy (700) and large; body 18px, line height 1.9, reading column 70ch. Labels stay at 13px or larger. Headings and short labels use `word-break: keep-all` so Thai words never split at a line end.
- Shape scale 4/8/12/16/20/28/32/48px plus full. Abstract M3 Expressive shapes (cookie, clover, flower, burst, sunny, scallop) come from `src/components/Shape.astro`. Grouped lists use larger outer corners than inner ones.
- No side-stripe accent borders, offset hard shadows, purple gradients or uniform radii. Only the floating hero card and menus cast a shadow.

## Composition
Hero: oversized headline with a filled pill on "บรรทัด", a rotating sunny shape behind Mashiro and a one-line code card. Course rows are tonal tiles with a shaped icon, chips for the first lessons and a cookie-shaped go button. Lesson shell: navigation drawer with pill indicator, article, contents rail with scroll-spy. Compact screens (<900px) fold navigation into native details sheets. Everything derives from section/lesson metadata.

## Interaction
Native links/buttons/radios/details/dialog. State layers are opacity overlays. Quiz bank python contains six topics (bank and topic are distinct). Questions use native fieldset/legend and radios; results are announced politely, with Mashiro reacting (blep when correct, crying when wrong). Navigator is a list of buttons, not a tablist. Code notes are inline disclosures plus optional stepping, not hover-only tooltips.

## Motion
Values come from `swiftify-design-motion` (`catalog.py export --platform css`): ElementMove/ClickBounce 400–500ms cubic-bezier(.38,1.21,.22,1), ElementMoveSmall 350ms cubic-bezier(.42,1.67,.21,.9), ElementMoveEnter 400ms cubic-bezier(.05,.7,.1,1), HoverFade 350ms cubic-bezier(.2,0,0,1). The Bounce (7/.24) and MediaCard tilt (4/.3) springs and Reveal OutBack 2.2 are sampled `linear()` approximations, labelled in `motion.css`; they are not live springs.
- Only transform (including `translate`/`scale`/`rotate`) and opacity animate. Entrances use the individual properties so they compose with hover transforms.
- Pages: cross-document view transitions, new page fades 210ms and rises 14px; section shapes and lesson titles hand off between pages.
- Ambient loops (rotating hero shapes, scallop drift while hovered, animated mascots, wavy reading progress) run only while visible or hovered.
- `prefers-reduced-motion: reduce` stops loops, mascots fall back to still frames, and travel, bounce, reveals and page rise are removed. Fades and state layers remain. State never waits for an animation, and content is visible if animations never run.
