#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";
import { loadPyodide } from "pyodide";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const examplePath = join(root, "src/content/examples/python101.json");
const teachingPath = join(root, "src/content/teaching/python101.json");
const workerPath = join(root, "src/workers/python.worker.ts");
const runnerMatch = readFileSync(workerPath, "utf8").match(/const runner = String\.raw`\n([\s\S]*?)\n`;/);
if (!runnerMatch) throw new Error(`Cannot extract runner from ${workerPath}`);
const runner = runnerMatch[1];
const examples = JSON.parse(readFileSync(examplePath, "utf8"));
const teachings = JSON.parse(readFileSync(teachingPath, "utf8"));
const setCases = new Set([
  "python101-data-structures-06",
  "python101-data-structures-12",
]);
const setVariables = new Map([
  ["python101-data-structures-06", new Set(["tags"])],
  ["python101-data-structures-12", new Set(["unique_words"])],
]);

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, stable(value[key])]));
  return value;
}

function normalizeSetRepr(value) {
  if (typeof value !== "string") return null;
  if (value === "set()") return "{}";
  const text = value.trim();
  if (!(text.startsWith("{") && text.endsWith("}"))) return null;
  const inner = text.slice(1, -1).trim();
  if (!inner) return "{}";
  const items = [];
  let index = 0;
  while (index < inner.length) {
    while (/\s/.test(inner[index] ?? "")) index++;
    const quote = inner[index];
    if (quote !== "'" && quote !== '"') return null;
    const start = index++;
    let escaped = false;
    for (; index < inner.length; index++) {
      const char = inner[index];
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === quote) {
        index++;
        break;
      }
    }
    if (inner[index - 1] !== quote) return null;
    items.push(inner.slice(start, index));
    while (/\s/.test(inner[index] ?? "")) index++;
    if (index < inner.length) {
      if (inner[index] !== ",") return null;
      index++;
    }
  }
  return `{${items.sort().join(",")}}`;
}

function normalizeStdout(id, stdout) {
  if (!setCases.has(id) || typeof stdout !== "string") return stdout;
  return stdout.split("\n").map((line) => normalizeSetRepr(line) ?? line).join("\n");
}

function normalizeErrno(value) {
  return typeof value === "string" ? value.replace(/\[Errno \d+\]/g, "[Errno *]") : value;
}

function normalizeStep(id, step) {
  const { noteIndex: _noteIndex, ...runtimeFields } = step;
  const output = { ...runtimeFields, stdout: normalizeStdout(id, step.stdout) };
  if (output.error !== undefined) output.error = normalizeErrno(output.error);
  const unorderedNames = setVariables.get(id);
  if (unorderedNames && Array.isArray(output.variables)) {
    output.variables = output.variables.map((variable) => {
      if (!unorderedNames.has(variable.name)) return variable;
      const normalized = normalizeSetRepr(variable.value);
      return normalized === null ? variable : { ...variable, value: normalized };
    });
  }
  return stable(output);
}

function runOneInFreshProcess(id) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), "--case", id], {
      cwd: root,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    const timeout = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("Pyodide case exceeded 45s timeout"));
    }, 45000);
    child.stdout.setEncoding("utf8").on("data", (chunk) => { stdout += chunk; });
    child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
    child.on("error", (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on("close", (status) => {
      clearTimeout(timeout);
      if (status !== 0) reject(new Error((stderr || stdout || `child exit ${status}`).trim()));
      else {
        try {
          resolve(JSON.parse(stdout));
        } catch (error) {
          reject(error);
        }
      }
    });
  });
}

function compareWalkthrough(id, baseline, actual) {
  if (!Array.isArray(baseline) || !Array.isArray(actual)) return "trace is missing or invalid";
  if (baseline.length !== actual.length)
    return `step count differs: baseline ${baseline.length}, Pyodide ${actual.length}`;
  const normalizations = new Set();
  for (let index = 0; index < baseline.length; index++) {
    const expected = baseline[index];
    const received = actual[index];
    if (expected.line !== received.line)
      return `step ${index + 1} line differs: baseline ${expected.line}, Pyodide ${received.line}`;
    if (setCases.has(id)) {
      const { noteIndex: _noteIndex, ...expectedRuntimeFields } = expected;
      const before = JSON.stringify(stable(expectedRuntimeFields));
      const after = JSON.stringify(stable(received));
      if (before !== after) normalizations.add("known unordered set representation normalized");
    }
    if (expected.error !== received.error && normalizeErrno(expected.error) === normalizeErrno(received.error))
      normalizations.add("platform errno number normalized");
    if (JSON.stringify(normalizeStep(id, expected)) !== JSON.stringify(normalizeStep(id, received))) {
      return `step ${index + 1} differs\n  baseline: ${JSON.stringify(expected).slice(0, 900)}\n  Pyodide: ${JSON.stringify(received).slice(0, 900)}`;
    }
  }
  return normalizations.size ? [...normalizations].join("; ") : null;
}

async function childRun(id) {
  const example = examples[id];
  const teaching = teachings[id];
  if (!example || !teaching) throw new Error(`Unknown Python example ${id}`);
  const pyodide = await loadPyodide({ indexURL: join(root, "node_modules/pyodide/") });
  const globals = {
    __lesson_source: example.code,
    __lesson_inputs_json: JSON.stringify(teaching.inputs ?? []),
    __lesson_values_json: JSON.stringify(teaching.values ?? {}),
    __lesson_files_json: JSON.stringify(teaching.files ?? {}),
    __lesson_editable_json: JSON.stringify(teaching.editable ?? []),
    __lesson_edits_json: JSON.stringify({}),
    __lesson_setup: teaching.setup ?? "",
    __lesson_random_seed_json: JSON.stringify(teaching.randomSeed ?? null),
    __lesson_date_json: JSON.stringify(teaching.date ?? null),
  };
  for (const [name, value] of Object.entries(globals)) pyodide.globals.set(name, value);
  const value = pyodide.runPython(runner);
  const trace = JSON.parse(value);
  if (example.status === "working" && trace.at(-1)?.event === "exception" && trace.at(-1)?.needsInput === undefined)
    throw new Error(`working example raised ${trace.at(-1)?.error ?? "an exception"}`);
  if (trace.at(-1)?.needsInput !== undefined)
    throw new Error(`fixture ended before input[${trace.at(-1).needsInput}]`);
  return trace;
}

if (process.argv[2] === "--case") {
  try {
    process.stdout.write(JSON.stringify(await childRun(process.argv[3])));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
} else {
  const onlyIndex = process.argv.indexOf("--only");
  const onlyArg = onlyIndex >= 0
    ? process.argv[onlyIndex + 1]
    : process.argv.find((argument) => argument.startsWith("--only="))?.slice("--only=".length);
  if (onlyIndex >= 0 && !onlyArg) throw new Error("--only requires a comma-separated ID list");
  const requestedIds = onlyArg ? new Set(onlyArg.split(",").map((id) => id.trim()).filter(Boolean)) : null;
  const allIds = Object.entries(teachings)
    .filter(([id, teaching]) => examples[id]?.language === "python" && ["console", "walkthrough"].includes(teaching.mode))
    .map(([id]) => id);
  if (requestedIds) {
    const unknownIds = [...requestedIds].filter((id) => !allIds.includes(id));
    if (unknownIds.length) throw new Error(`--only contains unknown/non-Python ids: ${unknownIds.join(", ")}`);
  }
  const ids = requestedIds ? allIds.filter((id) => requestedIds.has(id)) : allIds;
  if (requestedIds && ids.length !== requestedIds.size)
    throw new Error("--only ids must be unique");
  let passed = 0;
  let normalizedSetCases = 0;
  let normalizedErrnoCases = 0;
  let consoles = 0;
  let walkthroughs = 0;
  let failed = 0;
  let nextIndex = 0;
  const checkCase = async (id) => {
    const teaching = teachings[id];
    try {
      const actual = await runOneInFreshProcess(id);
      if (teaching.mode === "walkthrough") {
        walkthroughs++;
        const result = compareWalkthrough(id, teaching.trace, actual);
        if (result?.startsWith("step ") || result === "trace is missing or invalid") {
          failed++;
          console.log(`FAIL ${id}: ${result}`);
        } else {
          passed++;
          if (result?.includes("set representation")) normalizedSetCases++;
          if (result?.includes("errno")) normalizedErrnoCases++;
          console.log(`PASS ${id}${result ? ` (${result})` : ""}`);
        }
      } else {
        consoles++;
        const output = actual.at(-1)?.stdout ?? "";
        const baselineOutput = teaching.consoleOutput ?? "";
        const normalizedOutput = normalizeStdout(id, output);
        if (normalizedOutput !== normalizeStdout(id, baselineOutput)) {
          failed++;
          console.log(`FAIL ${id}: console stdout differs\n  baseline: ${JSON.stringify(baselineOutput)}\n  Pyodide: ${JSON.stringify(output)}`);
        } else {
          passed++;
          if (output !== baselineOutput && setCases.has(id)) normalizedSetCases++;
          console.log(`PASS ${id}${output !== baselineOutput && setCases.has(id) ? " (known unordered set output normalized)" : " (console stdout)"}`);
        }
      }
    } catch (error) {
      failed++;
      console.log(`FAIL ${id}: ${error instanceof Error ? error.message : String(error)}`);
    }
  };
  const workers = Array.from({ length: 4 }, async () => {
    while (nextIndex < ids.length) {
      const id = ids[nextIndex++];
      await checkCase(id);
    }
  });
  await Promise.all(workers);
  console.log(`Summary: ${passed}/${ids.length} matched; ${walkthroughs} walkthroughs; ${consoles} consoles; ${normalizedSetCases} known unordered-set normalizations; ${normalizedErrnoCases} platform errno normalizations; ${failed} failures.`);
  process.exitCode = failed ? 1 : 0;
}
