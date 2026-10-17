# Project instructions

## Product
- Thai-only beginner learning site, brand ทีละบรรทัด. Astro static + TypeScript + Vue islands, Bun.
- Sources are read-only: ../python101, ../git101, /home/mashiro/repo/wayo-final. Do not change them or the nested React project.
- Content is file-managed. New sections and lessons must populate indexes/navigation without editing layouts.
- No accounts, backend, cookies, saved learning progress, bookmarks or forced quiz timer. Quiz state is memory-only.
- Preserve all 27 Thai source pages, 73 questions, option ordering, correct indexes, code, commands and outputs. Broken debugging examples stay broken and labelled.

## Design and writing
- Follow DESIGN.md and CONTENT.md. Use the supplied anti-slop principles and material3-web-design skill.
- Solid purple roles, paper surfaces, editorial typography. No purple gradient, generic hero/three feature cards, uniform corner radii or blanket shadows.
- UI/prose must be Thai; technical names and code remain exact. Claude remote with Humanizer writes learner-facing prose; parent and Luna review correctness.
- Animate transform and opacity only. Respect reduced motion; state never waits for animations.
- Use native semantic controls and visible focus. Articles and code remain readable without hydration.

## Collaboration and checks
- Parent owns Astro shell/routes/design/content contracts; Luna owns Vue interactive components; editorial worker owns migration; agy owns content validation/search helpers under scripts and src/lib/search.ts only.
- You are not alone. Do not revert or overwrite another worker's changes; coordinate interface changes.
- Implement the accepted validation/acceptance checks. Do not commit, push, deploy or publish unless requested.
