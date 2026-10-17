# Adding lessons consistently

This guide applies to every contributor and coding agent that edits learner-facing content or adds a lesson. `AGENTS.md` makes the review and Humanizer steps part of the project workflow.

## Before you write

1. Read `AGENTS.md`, `DESIGN.md`, and the relevant parts of `CONTENT.md`.
2. Find the lesson's existing source in the read-only Python101 or Git101 repository. Keep original commands, code, output, option order, and answer indexes. Do not edit the source repositories. Mark intentionally incorrect debugging examples as incorrect and keep their original behavior.
3. Decide where the lesson belongs before adding files. Existing section indexes and navigation are data-driven; do not add a one-off navigation entry or hardcoded page count.

## Add the lesson

- Add the MDX lesson under `src/content/lessons/<section>/`. Set its section, title, description, order, source, and `draft` in frontmatter. Choose the next section order and use a clear title.
- Add each code sample to `src/content/examples/<section>.json` and render it with `CodeExample`. Give it a unique ID and a title. Cover every non-empty source line with a concise, explanatory note. Keep code and sample output verbatim from the source. For intentionally broken code, keep `status: "broken"` and explain the error. A fragment uses `status: "fragment"`.
- Add teaching metadata to `src/content/teaching/<section>.json` when choosing console or walkthrough display, defining fixtures or editable values, or supplying a baseline trace. Short samples use console output. Keep step explanations tied to real program state; do not invent variable values or runtime output. Git walkthroughs explain commands and their effects without running a shell.
- Use Thai for learner-facing prose and controls. Keep programming terms, identifiers, commands, code, and output exact. Explain an unfamiliar term briefly when it first appears. Prefer direct explanations of what changes and why over restating syntax.
- Use the existing icon system in `src/components/Icon.astro` for page-level interface icons. Its supported names are `arrow`, `down`, `down-left`, `external`, `search`, `code`, `branch`, `practice`, and `book`; check the component for current names before choosing. Use inline SVG with a `viewBox`, `aria-hidden="true"` for decorative marks, consistent stroke treatment, and a native link or button for actions. Do not use emoji as icons or add an icon package for one symbol. Keep lesson paragraphs focused on teaching rather than adding decorative icons.
- Preserve semantic headings, tables, code fences, visible labels, focus states, and mobile reading order. Follow the paper surfaces, purple roles, and shape choices in `DESIGN.md`. Motion is limited to transform and opacity and follows reduced-motion preferences.

## Humanizer is required before every content commit

Before committing any new or changed lesson title, description, explanation, hint, question, answer explanation, search copy, interface label, README prose, or other learner-facing text:

1. Send the exact changed prose to Claude with Humanizer skill **3.1.0**. Keep code, commands, inline code, file paths, identifiers, numbers, answer keys, and source quotations unchanged. Humanizer edits are about natural wording only.
2. Apply its rewrite, then compare the revised prose against the source and lesson context. Restore any lost factual detail and reject any invented claim. A human review remains required; Humanizer cannot validate technical correctness.
3. Check that the result reads like ordinary Thai, uses familiar words, and avoids generic announcements, repeated conclusions, forced three-part lists, inflated claims, and chatbot filler. Do not make it stiff to satisfy a pattern list.
4. Review all source parity and technical terms yourself. Run the content and project checks below.
5. Do not commit edited learner-facing prose until the Humanizer pass and factual review are complete. If Humanizer is unavailable, leave those changes uncommitted and report the blocker instead of claiming review happened.

The Humanizer skill is installed on the configured Claude remote as `~/.claude/skills/humanizer`. Use the remote workflow in the `use-claude-remote` skill, pass the skill file to Claude, and send only the prose and context needed for this task. Never send credentials or unrelated private files. A prompt that merely says "sound human" without applying the Humanizer skill is not a Humanizer pass.

Record provenance for a batch of editorial work in `docs/editorial/provenance/` or update its existing record: files reviewed, Humanizer skill/version and provider, technical reviewer, parity evidence, commands run, and any skipped checks. Do not claim that unavailable source-parity or runtime checks passed.

## Before handing off

Run:

```sh
bun run validate
bun run check
bun run build
bun run check:routes
```

Use `bun run check:extension` when adding a section or verifying that content additions remain data-driven. For changed Python teaching traces or console output, review `python3 scripts/trace/generate.py --only <example-id>` first, then compare the result in Pyodide with `node scripts/trace/check-pyodide.mjs --only <example-id>`; write regenerated data only after the output is reviewed. Follow the commands' current `--help` because these tools may gain options.

In your handoff, state which content files changed, Humanizer and technical review evidence, validation results, and any remaining limitation. Commit only after the required reviews; push only when the user requests it.
