#!/usr/bin/env python3
"""Apply validated Claude line notes to the generated example maps."""

from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
JOBS = {
    'python101': ['/tmp/dssi-claude-notes-python-1.json', '/tmp/dssi-claude-notes-python-2.json'],
    'git101': ['/tmp/dssi-claude-notes-git.json'],
}


def read_notes(path: str) -> dict:
    response = json.loads(Path(path).read_text())
    if response.get('type') != 'result' or response.get('is_error'):
        raise RuntimeError(f'Claude task failed: {path}')
    raw = response['result']
    match = re.search(r'```json\s*(\{.*?\})\s*```', raw, re.S)
    if not match:
        raise RuntimeError(f'Claude notes JSON not found: {path}')
    value = json.loads(match.group(1))
    if not isinstance(value.get('examples'), dict):
        raise RuntimeError(f'Claude notes map not found: {path}')
    return value['examples']


def main() -> None:
    for section, jobs in JOBS.items():
        path = ROOT / f'src/content/examples/{section}.json'
        examples = json.loads(path.read_text())
        notes: dict = {}
        for job in jobs:
            if not Path(job).exists():
                continue
            notes.update(read_notes(job))
        if not notes:
            print(section, 'notes pending')
            continue
        if set(notes) != set(examples):
            missing = sorted(set(examples) - set(notes))
            extra = sorted(set(notes) - set(examples))
            raise RuntimeError(f'{section} note ids mismatch; missing={missing}, extra={extra}')
        for example_id, example in examples.items():
            item = notes[example_id]
            rows = item.get('notes')
            if not isinstance(item.get('title'), str) or not item['title'].strip():
                raise RuntimeError(f'{example_id} has no title')
            if not isinstance(rows, list) or not rows:
                raise RuntimeError(f'{example_id} has no notes')
            line_count = len(example['code'].splitlines())
            covered: set[int] = set()
            for row in rows:
                start, end = row.get('range', [0, 0])
                if not isinstance(start, int) or not isinstance(end, int) or start < 1 or end < start or end > line_count:
                    raise RuntimeError(f'{example_id} has invalid range {row.get("range")} for {line_count} lines')
                if not isinstance(row.get('note'), str) or not row['note'].strip():
                    raise RuntimeError(f'{example_id} has empty note')
                covered.update(range(start, end + 1))
            required = {i for i, line in enumerate(example['code'].splitlines(), 1) if line.strip()}
            if not required.issubset(covered):
                raise RuntimeError(f'{example_id} does not cover every line: {sorted(set(range(1, line_count + 1)) - covered)}')
            example['title'] = item['title']
            example['notes'] = rows
        path.write_text(json.dumps(examples, ensure_ascii=False, indent=2) + '\n')
        print(section, len(examples), 'examples updated')


if __name__ == '__main__':
    main()
