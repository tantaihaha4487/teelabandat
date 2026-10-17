#!/usr/bin/env node
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { runInNewContext } from "node:vm";
import { parse as parseYaml } from "yaml";

const cwd = process.cwd();
const errors = [];
const err = (f, msg) => errors.push(`${f}: ${msg}`);
const readJSON = (p) => JSON.parse(readFileSync(p, "utf-8"));
const ls = (dir, ext) =>
  existsSync(dir)
    ? readdirSync(dir)
        .filter((f) => f.endsWith(ext))
        .map((f) => join(dir, f))
    : [];

function walk(dir, ext, out = []) {
  if (!existsSync(dir)) return out;
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, d.name);
    if (d.isDirectory()) walk(full, ext, out);
    else if (d.name.endsWith(ext)) out.push(full);
  }
  return out;
}

function parseFM(content) {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? parseYaml(m[1]) : null;
}

// ── Sections ──
const sections = new Map();
for (const f of ls(join(cwd, "src/content/sections"), ".json")) {
  const rel = relative(cwd, f);
  try {
    const d = readJSON(f);
    for (const k of [
      "id",
      "title",
      "summary",
      "order",
      "kind",
      "label",
      "icon",
    ])
      if (d[k] === undefined) err(rel, `missing "${k}"`);
    if (d.kind && !["course", "practice"].includes(d.kind))
      err(rel, `invalid kind "${d.kind}"`);
    if (d.icon && !["code", "branch", "practice", "book"].includes(d.icon))
      err(rel, `invalid icon "${d.icon}"`);
    if (sections.has(d.id)) err(rel, `duplicate section id ${d.id}`);
    if (d.id !== basename(f, ".json"))
      err(rel, "section id must match filename");
    sections.set(d.id, d);
  } catch (e) {
    err(rel, e.message);
  }
}

// ── Lessons ──
const lessonFiles = walk(join(cwd, "src/content/lessons"), ".mdx");
const orderMap = new Map();
const srcCount = { python101: 0, git101: 0 };

for (const f of lessonFiles) {
  const rel = relative(cwd, f);
  const raw = readFileSync(f, "utf-8");
  const fm = parseFM(raw);
  if (!fm) {
    err(rel, "missing frontmatter");
    continue;
  }

  for (const k of ["section", "title", "description", "order", "source"])
    if (!fm[k] && fm[k] !== 0) err(rel, `missing frontmatter "${k}"`);
  if (fm.source !== undefined && !fm.source) err(rel, "empty source");
  if (fm.draft !== undefined && typeof fm.draft !== "boolean")
    err(rel, "draft must be boolean");
  if (fm.section && !sections.has(fm.section))
    err(rel, `unknown section "${fm.section}"`);
  if (fm.section && relative(join(cwd, "src/content/lessons"), f).split(/[\\/]/)[0] !== fm.section)
    err(rel, "lesson folder must match frontmatter section");

  if (fm.section) {
    if (!orderMap.has(fm.section)) orderMap.set(fm.section, []);
    orderMap.get(fm.section).push({ o: fm.order, f: rel });
  }
  if (!fm.draft && fm.section in srcCount) srcCount[fm.section]++;

  const body = raw.replace(/^---[\s\S]*?---/, "");
  for (const m of body.matchAll(/\]\((\.\/.+?\.mdx?)\)/g))
    err(rel, `local link ${m[1]} should use /learn/... path`);
  for (const m of body.matchAll(/\]\((?!https?:\/\/)(\/[^)]+)\)/g))
    if (/\/(th|en)\//.test(m[1]))
      err(rel, `internal path has /th/ or /en/: ${m[1]}`);
}

for (const [sec, items] of orderMap) {
  const seen = new Set();
  for (const { o, f } of items) {
    if (seen.has(o)) err(f, `duplicate order ${o} in section "${sec}"`);
    seen.add(o);
  }
}
if (srcCount.python101 < 14)
  err("lessons", `python101 count ${srcCount.python101}, expected 14`);
if (srcCount.git101 < 13)
  err("lessons", `git101 count ${srcCount.git101}, expected 13`);

// ── Examples ──
const exampleFiles = ls(join(cwd, "src/content/examples"), ".json");
const exampleIds = new Set();
const examplesById = new Map();
const examplesBySection = new Map();
let totalExamples = 0;
for (const f of exampleFiles) {
  const rel = relative(cwd, f);
  const section = basename(f, ".json");
  try {
    const data = readJSON(f);
    examplesBySection.set(section, new Set(Object.keys(data)));
    for (const [exId, ex] of Object.entries(data)) {
      const p = `${rel}#${exId}`;
      totalExamples++;
      if (exampleIds.has(exId)) err(p, "duplicate example id");
      exampleIds.add(exId);
      examplesById.set(exId, ex);
      if (ex.id !== exId) err(p, "id key mismatch");
      for (const k of ["id", "language", "code", "notes", "status"])
        if (ex[k] === undefined) err(p, `missing "${k}"`);
      if (ex.status && !["working", "broken", "fragment"].includes(ex.status))
        err(p, `invalid status "${ex.status}"`);
      if (ex.status === "broken" && !ex.error) err(p, "broken requires error");

      if (typeof ex.code === "string" && Array.isArray(ex.notes)) {
        const lines = ex.code.split("\n"),
          len = lines.length,
          covered = new Set();
        for (let ni = 0; ni < ex.notes.length; ni++) {
          const n = ex.notes[ni];
          if (!n.note || typeof n.note !== "string")
            err(p, `notes[${ni}].note empty`);
          if (!Array.isArray(n.range) || n.range.length !== 2) {
            err(p, `notes[${ni}].range invalid`);
            continue;
          }
          const [s, e] = n.range;
          if (
            !Number.isInteger(s) ||
            !Number.isInteger(e) ||
            s < 1 ||
            e < s ||
            e > len
          ) {
            err(p, `notes[${ni}].range [${s},${e}] out of bounds (1-${len})`);
            continue;
          }
          for (let l = s; l <= Math.min(e, len); l++) covered.add(l);
        }
        for (let l = 1; l <= len; l++)
          if (lines[l - 1].trim() && !covered.has(l))
            err(p, `line ${l} not covered by notes`);
      }
    }
  } catch (e) {
    err(rel, e.message);
  }
}

// ── Teaching modes and baseline execution traces ──
const teachingDir = join(cwd, "src/content/teaching");
const teachingFiles = ls(teachingDir, ".json");
const teachingById = new Map();
const jsonValue = (value) => {
  if (value === null || ["string", "number", "boolean"].includes(typeof value))
    return typeof value !== "number" || Number.isFinite(value);
  if (Array.isArray(value)) return value.every(jsonValue);
  if (typeof value === "object")
    return Object.values(value).every(jsonValue);
  return false;
};
const isScalar = (value) =>
  value === null ||
  ["string", "boolean"].includes(typeof value) ||
  (typeof value === "number" && Number.isFinite(value));

let consoleExamples = 0;
let walkthroughExamples = 0;
let tracedExamples = 0;
for (const f of teachingFiles) {
  const rel = relative(cwd, f);
  const section = basename(f, ".json");
  const expectedIds = examplesBySection.get(section);
  if (!expectedIds) err(rel, `no examples file for teaching section "${section}"`);
  try {
    const entries = readJSON(f);
    if (!entries || Array.isArray(entries) || typeof entries !== "object") {
      err(rel, "teaching sidecar must be an object keyed by example id");
      continue;
    }
    for (const [id, entry] of Object.entries(entries)) {
      const p = `${rel}#${id}`;
      const example = examplesById.get(id);
      if (!expectedIds?.has(id)) err(p, "example is not in this section's examples file");
      if (!example) {
        err(p, "unknown example id");
        continue;
      }
      if (teachingById.has(id)) err(p, "duplicate teaching metadata id");
      teachingById.set(id, entry);

      if (!entry || Array.isArray(entry) || typeof entry !== "object") {
        err(p, "teaching metadata must be an object");
        continue;
      }
      if (!["console", "walkthrough"].includes(entry.mode))
        err(p, `invalid mode "${entry.mode}"`);
      else if (entry.mode === "console") consoleExamples++;
      else walkthroughExamples++;
      if (typeof entry.summary !== "string" || !entry.summary.trim())
        err(p, "summary must be a non-empty string");
      if (entry.consoleOutput !== undefined) {
        if (typeof entry.consoleOutput !== "string") err(p, "consoleOutput must be a string");
        if (entry.mode !== "console") err(p, "consoleOutput is only valid for console mode");
      }
      for (const key of ["setup", "context"])
        if (entry[key] !== undefined && (typeof entry[key] !== "string" || !entry[key].trim()))
          err(p, `${key} must be a non-empty string when provided`);
      if (entry.randomSeed !== undefined && (typeof entry.randomSeed !== "number" || !Number.isFinite(entry.randomSeed)))
        err(p, "randomSeed must be a finite number");
      if (entry.date !== undefined) {
        const parsedDate = typeof entry.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.date)
          ? new Date(`${entry.date}T00:00:00.000Z`)
          : null;
        if (!parsedDate || Number.isNaN(parsedDate.valueOf()) || parsedDate.toISOString().slice(0, 10) !== entry.date)
          err(p, "date must be a valid calendar date in YYYY-MM-DD format");
      }

      if (entry.inputs !== undefined && (!Array.isArray(entry.inputs) || entry.inputs.some((x) => typeof x !== "string")))
        err(p, "inputs must be an array of strings");
      if (entry.values !== undefined) {
        if (!entry.values || Array.isArray(entry.values) || typeof entry.values !== "object")
          err(p, "values must be an object of scalar initial values");
        else
          for (const [name, value] of Object.entries(entry.values)) {
            if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(name)) err(p, `invalid initial variable name "${name}"`);
            if (!isScalar(value)) err(p, `values.${name} must be a JSON scalar`);
          }
      }
      if (entry.files !== undefined) {
        if (!entry.files || Array.isArray(entry.files) || typeof entry.files !== "object")
          err(p, "files must be an object mapping paths to text");
        else
          for (const [path, content] of Object.entries(entry.files)) {
            if (!path || path.startsWith("/") || path.split(/[\\/]/).includes("..")) err(p, `unsafe virtual file path "${path}"`);
            if (typeof content !== "string") err(p, `files.${path} must be a string`);
          }
      }

      const inputs = Array.isArray(entry.inputs) ? entry.inputs : [];
      const values = entry.values && typeof entry.values === "object" && !Array.isArray(entry.values) ? entry.values : {};
      const editable = entry.editable ?? [];
      if (!Array.isArray(editable)) err(p, "editable must be an array");
      else {
        const editIds = new Set();
        for (let ei = 0; ei < editable.length; ei++) {
          const field = editable[ei], ep = `${p}.editable[${ei}]`;
          if (!field || typeof field !== "object" || Array.isArray(field)) {
            err(ep, "must be an object");
            continue;
          }
          for (const key of ["id", "label", "kind", "target", "initial"])
            if (field[key] === undefined) err(ep, `missing "${key}"`);
          if (typeof field.id !== "string" || !field.id.trim()) err(ep, "id must be a non-empty string");
          else if (editIds.has(field.id)) err(ep, `duplicate editable id "${field.id}"`);
          else editIds.add(field.id);
          if (typeof field.label !== "string" || !field.label.trim()) err(ep, "label must be a non-empty string");
          if (!["input", "value"].includes(field.kind)) err(ep, `invalid kind "${field.kind}"`);
          if (typeof field.target !== "string" || !field.target.trim()) err(ep, "target must be a non-empty string");
          if (!isScalar(field.initial)) err(ep, "initial must be a JSON scalar");
          if (field.type !== undefined && !["text", "number", "boolean"].includes(field.type)) err(ep, `invalid type "${field.type}"`);

          if (field.kind === "input" && typeof field.target === "string") {
            const match = field.target.match(/^stdin\[(\d+)\]$/);
            if (!match) err(ep, 'input target must use the form "stdin[0]"');
            else if (Number(match[1]) >= inputs.length) err(ep, `target ${field.target} has no matching inputs fixture`);
            if (typeof field.initial !== "string") err(ep, "input initial must be a string");
          }
          if (field.kind === "value" && typeof field.target === "string") {
            if (!/^[\p{L}_][\p{L}\p{N}_]*$/u.test(field.target)) err(ep, `invalid variable target "${field.target}"`);
            if (Object.hasOwn(values, field.target) && values[field.target] !== field.initial)
              err(ep, `initial does not match values.${field.target}`);
            const sourceNames = typeof example.code === "string"
              ? example.code.match(/[\p{L}_][\p{L}\p{N}_]*/gu) ?? []
              : [];
            if (!Object.hasOwn(values, field.target) && !sourceNames.includes(field.target))
              err(ep, `target "${field.target}" is absent from values and source code`);
          }
          if (field.type === "number" && field.initial !== undefined && field.initial !== "" && !Number.isFinite(Number(field.initial)))
            err(ep, "number field initial must be numeric");
          if (field.type === "boolean" && (field.kind !== "value" || typeof field.initial !== "boolean"))
            err(ep, 'boolean fields must target a value with a boolean initial');
        }
      }

      if (entry.trace !== undefined && !Array.isArray(entry.trace)) err(p, "trace must be an array");
      else if (Array.isArray(entry.trace) && entry.trace.length) {
        if (entry.mode !== "walkthrough") err(p, "only walkthrough examples may contain trace steps");
        tracedExamples++;
        const sourceLines = typeof example.code === "string" ? example.code.split("\n") : [];
        for (let ti = 0; ti < entry.trace.length; ti++) {
          const step = entry.trace[ti], tp = `${p}.trace[${ti}]`;
          if (!step || typeof step !== "object" || Array.isArray(step)) {
            err(tp, "must be an object");
            continue;
          }
          if (!Number.isInteger(step.line) || step.line < 1 || step.line > sourceLines.length)
            err(tp, `line must be within source bounds (1-${sourceLines.length})`);
          else if (!sourceLines[step.line - 1].trim()) err(tp, `line ${step.line} is blank`);
          if (step.noteIndex !== undefined && (!Number.isInteger(step.noteIndex) || step.noteIndex < 0 || step.noteIndex >= (example.notes?.length ?? 0)))
            err(tp, `noteIndex must be within notes bounds (0-${Math.max(0, (example.notes?.length ?? 0) - 1)})`);
          if (step.scope !== undefined && (typeof step.scope !== "string" || !step.scope.trim())) err(tp, "scope must be a non-empty string");
          if (!Array.isArray(step.variables)) err(tp, "variables must be an array");
          else {
            const variableNames = new Set();
            for (let vi = 0; vi < step.variables.length; vi++) {
              const variable = step.variables[vi], vp = `${tp}.variables[${vi}]`;
              if (!variable || typeof variable !== "object" || Array.isArray(variable)) {
                err(vp, "must be an object");
                continue;
              }
              if (typeof variable.name !== "string" || !variable.name.trim()) err(vp, "name must be a non-empty string");
              else if (variableNames.has(`${variable.scope ?? step.scope ?? ""}:${variable.name}`)) err(vp, `duplicate variable "${variable.name}" in scope`);
              else variableNames.add(`${variable.scope ?? step.scope ?? ""}:${variable.name}`);
              if (!jsonValue(variable.value)) err(vp, "value must be JSON-compatible");
              if (variable.scope !== undefined && (typeof variable.scope !== "string" || !variable.scope.trim())) err(vp, "scope must be a non-empty string");
              if (variable.change !== undefined && !["new", "changed", "removed"].includes(variable.change)) err(vp, `invalid change "${variable.change}"`);
            }
          }
          for (const key of ["stdout", "error"])
            if (step[key] !== undefined && typeof step[key] !== "string") err(tp, `${key} must be a string`);
          if (step.returnValue !== undefined && !jsonValue(step.returnValue))
            err(tp, "returnValue must be JSON-compatible");
          if (step.needsInput !== undefined && (!Number.isInteger(step.needsInput) || step.needsInput < 0))
            err(tp, "needsInput must be a non-negative input index");
          if (step.inputPrompt !== undefined && typeof step.inputPrompt !== "string")
            err(tp, "inputPrompt must be a string");
          if (step.event !== undefined && !["line", "return", "exception"].includes(step.event)) err(tp, `invalid event "${step.event}"`);
        }
      }
    }
  } catch (e) {
    err(rel, e.message);
  }
}

for (const [section, ids] of examplesBySection)
  for (const id of ids)
    if (!teachingById.has(id)) err(`teaching/${section}`, `missing metadata for ${id}`);
for (const section of teachingFiles.map((f) => basename(f, ".json")))
  if (!examplesBySection.has(section)) err(`teaching/${section}`, "no matching examples file");

// ── Quiz Banks ──
const bankFiles = ls(join(cwd, "src/data"), "-bank.json");
const bankIds = new Set();

for (const f of bankFiles) {
  const rel = relative(cwd, f);
  const expected = basename(f).replace(/-bank\.json$/, "");
  try {
    const bank = readJSON(f);
    for (const k of ["id", "title", "description", "topics", "questions"])
      if (bank[k] === undefined) err(rel, `missing "${k}"`);
    if (bank.id !== expected)
      err(rel, `id "${bank.id}" ≠ filename "${expected}"`);
    bankIds.add(bank.id);

    const topicIds = new Set(
      (bank.topics || []).map((t) => {
        if (!t.id || !t.title) err(rel, "topic missing id/title");
        return t.id;
      }),
    );
    const qIds = new Set();
    const isLegacy = bank.id === "python";

    if (isLegacy && bank.questions?.length < 73)
      err(
        rel,
        `legacy bank needs at least 73 protected questions, found ${bank.questions?.length}`,
      );

    for (let qi = 0; qi < (bank.questions || []).length; qi++) {
      const q = bank.questions[qi],
        qp = `${rel}#q${qi}`;
      if (!Number.isInteger(q.sourceId) || q.sourceId < 1)
        err(qp, "sourceId must be a positive integer");
      if (
        !q.prompt ||
        typeof q.code !== "string" ||
        !q.hint ||
        !Array.isArray(q.reasoningSteps) ||
        !q.reasoningSteps.length
      )
        err(qp, "incomplete question prose/code");
      if (qIds.has(q.sourceId)) err(qp, `duplicate sourceId ${q.sourceId}`);
      qIds.add(q.sourceId);
      if (q.bank !== bank.id) err(qp, "bank mismatch");
      if (!q.topic || !topicIds.has(q.topic))
        err(qp, `unknown topic "${q.topic}"`);
      if (!Array.isArray(q.options) || q.options.length < 2)
        err(qp, "needs ≥2 options");
      if (
        !Number.isInteger(q.correctIndex) ||
        q.correctIndex < 0 ||
        q.correctIndex >= (q.options?.length ?? 0)
      )
        err(qp, "correctIndex out of bounds");

      if (isLegacy && q.sourceId >= 1 && q.sourceId <= 73) {
        if (q.options?.length !== 5) err(qp, "legacy needs 5 options");
        if (!q.hint) err(qp, "legacy missing hint");
        if (!Array.isArray(q.reasoningSteps) || q.reasoningSteps.length !== 3)
          err(qp, "legacy needs exactly 3 reasoning steps");
        else if (q.reasoningSteps.some((s) => !s || typeof s !== "string"))
          err(qp, "reasoning steps must be non-empty strings");
      }
    }
    if (isLegacy)
      for (let i = 1; i <= 73; i++)
        if (!qIds.has(i) && !qIds.has(String(i)))
          err(rel, `missing sourceId ${i}`);
  } catch (e) {
    err(rel, e.message);
  }
}

for (const [id, s] of sections)
  if (s.kind === "practice" && !s.bank)
    err(`sections/${id}`, "practice section requires bank");
for (const [id, s] of sections)
  if (s.kind === "practice" && s.bank && !bankIds.has(s.bank))
    err(`sections/${id}`, `unknown bank "${s.bank}"`);

if (!bankIds.has("python")) err("banks", "missing python bank");

// ── Source Parity ──
const refDir = "/home/mashiro/repo/wayo-final";
const qPath = join(refDir, "questions.js"),
  aPath = join(refDir, "answer-key.js");

if (existsSync(qPath) && existsSync(aPath)) {
  try {
    const qCtx = { window: {} },
      aCtx = { window: {} };
    runInNewContext(readFileSync(qPath, "utf-8"), qCtx, { timeout: 5000 });
    runInNewContext(readFileSync(aPath, "utf-8"), aCtx, { timeout: 5000 });
    const origQ = qCtx.window.QUIZ_QUESTIONS,
      origA = aCtx.window.QUIZ_LEARNING;
    const pyPath = join(cwd, "src/data/python-bank.json");
    const pyBank = existsSync(pyPath) ? readJSON(pyPath) : null;

    if (origQ && origA && pyBank?.questions) {
      const parityErrorsBefore = errors.length;
      for (const oq of origQ) {
        const ours = pyBank.questions.find(
          (q) => q.sourceId === oq.id || q.sourceId === String(oq.id),
        );
        if (!ours) {
          err("parity", `missing sourceId ${oq.id}`);
          continue;
        }
        if (oq.code != null && ours.code !== oq.code)
          err("parity", `q${oq.id} code mismatch`);
        if (
          Array.isArray(oq.options) &&
          JSON.stringify(ours.options) !== JSON.stringify(oq.options)
        )
          err("parity", `q${oq.id} options mismatch`);
        if (
          oq.context &&
          !((ours.context || "") + " " + (ours.prompt || "")).includes("twenty")
        )
          err("parity", "q44 missing input context twenty");
        const oa = origA[oq.id];
        if (
          oa &&
          typeof oa.answer === "number" &&
          ours.correctIndex !== oa.answer
        )
          err(
            "parity",
            `q${oq.id} correctIndex ${ours.correctIndex} ≠ ${oa.answer}`,
          );
      }
      if (errors.length === parityErrorsBefore)
        console.log(`Source code/options/answer parity verified (${refDir})`);
    }
  } catch (e) {
    err("parity", e.message);
  }
} else {
  console.warn(
    `⚠ Reference check skipped: source files not found at ${refDir}`,
  );
}

// ── Frozen lesson examples, outputs and diagram source ──
let protectedLessonBlocks = 0;
for (const section of ["python101", "git101"]) {
  const sourceDir = join(cwd, "..", section, "docs/th");
  if (!existsSync(sourceDir)) {
    console.warn(`Lesson reference check skipped: ${sourceDir}`);
    continue;
  }
  for (const sourceFile of ls(sourceDir, ".md")) {
    const slug = basename(sourceFile, ".md");
    const migratedFile = join(cwd, "src/content/lessons", section, slug + ".mdx");
    if (!existsSync(migratedFile))
      err("lesson parity", `missing ${section}/${slug}`);
    else if (parseFM(readFileSync(migratedFile, "utf8"))?.draft)
      err("lesson parity", `original lesson cannot be draft: ${section}/${slug}`);
    const original = readFileSync(sourceFile, "utf8");
    let blockIndex = 0,
      diagramIndex = 0,
      lastExample = null;
    for (const match of original.matchAll(
      /^```([^\n]*)\n([\s\S]*?)^```[ \t]*$/gm,
    )) {
      blockIndex++;
      protectedLessonBlocks++;
      const language = match[1].trim().toLowerCase();
      const code = match[2].replace(/\n$/, "");
      if (language === "mermaid") {
        diagramIndex++;
        const diagram = join(
          cwd,
          "public/diagrams",
          `${section}-${slug}-${diagramIndex}.svg`,
        );
        if (!existsSync(diagram)) {
          err("diagrams", `missing ${diagram}`);
          continue;
        }
        const svg = readFileSync(diagram, "utf8");
        const metadata = svg
          .match(/<metadata>([\s\S]*?)<\/metadata>/)?.[1]
          ?.replaceAll("&lt;", "<")
          .replaceAll("&gt;", ">")
          .replaceAll("&quot;", '"')
          .replaceAll("&#x27;", "'")
          .replaceAll("&amp;", "&");
        if (metadata?.trim() !== code.trim())
          err("diagrams", `source metadata mismatch ${diagram}`);
        continue;
      }
      if (["text", "txt", "console"].includes(language) && lastExample) {
        if (examplesById.get(lastExample)?.output !== code)
          err("lesson parity", `output mismatch after ${lastExample}`);
        continue;
      }
      lastExample = `${section}-${slug}-${String(blockIndex).padStart(2, "0")}`;
      if (examplesById.get(lastExample)?.code !== code)
        err("lesson parity", `code mismatch ${lastExample}`);
    }
  }
}

// ── Report ──
if (errors.length) {
  console.error(`\n✗ ${errors.length} error(s):\n`);
  errors.forEach((e) => console.error(`  • ${e}`));
  process.exit(1);
} else {
  console.log(`\n✓ All checks passed`);
  console.log(
    `  ${sections.size} sections · ${lessonFiles.length} lessons · ${totalExamples} annotated examples · ${bankFiles.length} banks`,
  );
  console.log(
    `  ${consoleExamples} console · ${walkthroughExamples} walkthrough · ${tracedExamples}/${walkthroughExamples} walkthroughs with baseline traces`,
  );
  console.log(
    `  ${protectedLessonBlocks} original lesson code/output/diagram blocks compared.`,
  );
}
