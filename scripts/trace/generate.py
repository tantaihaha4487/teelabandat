#!/usr/bin/env python3
"""Generate truthful Python walkthrough traces using the app's embedded runner.

By default this is a dry run. Pass --write only after the teaching sidecars are
complete and the runtime wrapper has been reviewed. Working examples that
raise are reported and never receive a newly generated trace.
"""

from __future__ import annotations

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "src/workers/python.worker.ts"
EXAMPLES_DIR = ROOT / "src/content/examples"
TEACHING_DIR = ROOT / "src/content/teaching"
RUNNER_PATTERN = re.compile(r"const runner = String\.raw`\n([\s\S]*?)\n`;", re.MULTILINE)


def load_runner() -> str:
    source = WORKER.read_text(encoding="utf-8")
    match = RUNNER_PATTERN.search(source)
    if not match:
        raise RuntimeError(f"Could not find embedded String.raw runner in {WORKER}")
    return match.group(1)


def note_index_for_line(example: dict, line: int) -> int | None:
    for index, note in enumerate(example.get("notes", [])):
        span = note.get("range", [])
        if len(span) == 2 and span[0] <= line <= span[1]:
            return index
    return None


def execute(runner: str, example: dict, teaching: dict, timeout: float) -> list[dict]:
    payload = {
        "source": example["code"],
        "inputs": teaching.get("inputs", []),
        "values": teaching.get("values", {}),
        "files": teaching.get("files", {}),
        "editable": teaching.get("editable", []),
        "edits": {},
        "setup": teaching.get("setup", ""),
        "randomSeedJson": json.dumps(teaching.get("randomSeed")),
        "dateJson": json.dumps(teaching.get("date")),
    }
    # The prefix supplies the same globals that the browser worker sets on
    # Pyodide. Appending print exposes the runner's JSON result to this process.
    prefix = """import json, sys
_payload = json.loads(sys.stdin.readline())
__lesson_source = _payload["source"]
__lesson_inputs_json = json.dumps(_payload["inputs"], ensure_ascii=False)
__lesson_values_json = json.dumps(_payload["values"], ensure_ascii=False)
__lesson_files_json = json.dumps(_payload["files"], ensure_ascii=False)
__lesson_editable_json = json.dumps(_payload["editable"], ensure_ascii=False)
__lesson_edits_json = json.dumps(_payload["edits"], ensure_ascii=False)
__lesson_setup = _payload["setup"]
__lesson_random_seed_json = _payload["randomSeedJson"]
__lesson_date_json = _payload["dateJson"]
"""
    script = (
        prefix
        + runner
        + "\nprint(json.dumps(_steps, ensure_ascii=False))"
        + "\nimport shutil; shutil.rmtree(_root, ignore_errors=True)\n"
    )
    try:
        result = subprocess.run(
            [sys.executable, "-I", "-c", script],
            input=json.dumps(payload, ensure_ascii=False) + "\n",
            text=True,
            capture_output=True,
            timeout=timeout,
            cwd=ROOT,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise RuntimeError(f"execution exceeded {timeout:g}s timeout") from error
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise RuntimeError(f"runner process failed ({result.returncode}): {detail[-1200:]}")
    try:
        steps = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"runner returned invalid JSON: {result.stdout[-800:]!r}") from error
    if not isinstance(steps, list):
        raise RuntimeError("runner result was not a trace array")
    for step in steps:
        if isinstance(step, dict):
            index = note_index_for_line(example, step.get("line", 0))
            if index is not None:
                step["noteIndex"] = index
    return steps


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--section", choices=("python101",), help="limit generation to a section")
    parser.add_argument("--only", help="comma-separated example IDs to generate")
    parser.add_argument("--write", action="store_true", help="write generated traces into teaching sidecars")
    parser.add_argument("--timeout", type=float, default=5.0, help="per-example CPython timeout in seconds (default: 5)")
    args = parser.parse_args()
    if args.timeout <= 0:
        parser.error("--timeout must be greater than zero")

    try:
        runner = load_runner()
    except (OSError, RuntimeError) as error:
        print(f"ERROR: {error}", file=sys.stderr)
        return 2

    sections = [args.section] if args.section else ["python101"]
    only_ids = set(args.only.split(",")) if args.only else None
    if only_ids and any(not example_id.strip() for example_id in only_ids):
        parser.error("--only IDs must not be empty")
    total = generated_traces = walkthrough_examples = console_examples = console_outputs = skipped = failures = expected_errors = 0
    pending_writes: dict[Path, dict] = {}
    for section in sections:
        examples_path = EXAMPLES_DIR / f"{section}.json"
        teaching_path = TEACHING_DIR / f"{section}.json"
        if not examples_path.is_file() or not teaching_path.is_file():
            print(f"ERROR: missing sidecar or examples file for {section}", file=sys.stderr)
            failures += 1
            continue
        examples = json.loads(examples_path.read_text(encoding="utf-8"))
        teachings = json.loads(teaching_path.read_text(encoding="utf-8"))
        if only_ids:
            unknown_ids = only_ids - teachings.keys()
            if unknown_ids:
                print(f"ERROR: unknown teaching IDs for {section}: {', '.join(sorted(unknown_ids))}", file=sys.stderr)
                failures += 1
                continue
        updated = dict(teachings)
        for example_id, teaching in teachings.items():
            if only_ids and example_id not in only_ids:
                continue
            example = examples.get(example_id)
            if not example or teaching.get("mode") not in {"console", "walkthrough"} or example.get("language") != "python":
                continue
            total += 1
            mode = teaching["mode"]
            if mode == "console":
                console_examples += 1
            else:
                walkthrough_examples += 1
            try:
                trace = execute(runner, example, teaching, args.timeout)
            except (KeyError, RuntimeError, OSError) as error:
                failures += 1
                print(f"ERROR {example_id}: {error}")
                continue

            terminal = trace[-1] if trace else None
            if terminal and isinstance(terminal.get("needsInput"), int):
                failures += 1
                print(
                    f"INCOMPLETE INPUT {example_id}: runner needs input[{terminal['needsInput']}]"
                )
                continue
            raised = terminal if terminal and terminal.get("event") == "exception" else None
            if raised and example.get("status") == "working":
                failures += 1
                print(f"UNEXPECTED ERROR {example_id}: {raised.get('error', '(no message)')}")
                continue
            if raised:
                expected_errors += 1
                print(f"EXPECTED ERROR {example_id}: {raised.get('error', '(no message)')}")
            if not trace:
                skipped += 1
                print(f"NO TRACE {example_id}: runner produced no execution steps")
                continue
            if mode == "walkthrough":
                updated[example_id] = {**teaching, "trace": trace}
                generated_traces += 1
                print(f"OK {example_id}: {len(trace)} steps")
            else:
                output = trace[-1].get("stdout", "")
                if output:
                    updated[example_id] = {**teaching, "consoleOutput": output}
                    console_outputs += 1
                    print(f"OK {example_id}: {len(output)} output characters")
                else:
                    updated[example_id] = {
                        key: value for key, value in teaching.items() if key != "consoleOutput"
                    }
                    print(f"NO OUTPUT {example_id}: execution produced no stdout")

        if updated != teachings:
            pending_writes[teaching_path] = updated

    if only_ids:
        found_ids = {
            example_id
            for section in sections
            for example_id in json.loads((TEACHING_DIR / f"{section}.json").read_text(encoding="utf-8"))
            if example_id in only_ids
        }
        missing_ids = only_ids - found_ids
        if missing_ids:
            print(f"ERROR: IDs not found in selected section(s): {', '.join(sorted(missing_ids))}", file=sys.stderr)
            failures += 1

    if args.write and failures == 0:
        for path, data in pending_writes.items():
            path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
        print(f"Wrote traces to {len(pending_writes)} sidecar(s).")
    elif pending_writes:
        print("Dry run: no sidecars changed. Pass --write after reviewing the report.")

    print(f"Summary: {generated_traces}/{walkthrough_examples} Python walkthroughs traced; {console_outputs}/{console_examples} Python consoles emitted stdout; {expected_errors} expected errors; {skipped} without steps; {failures} failures.")
    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())
