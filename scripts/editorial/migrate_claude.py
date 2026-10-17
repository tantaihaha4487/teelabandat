#!/usr/bin/env python3
"""Turn validated Claude rewrites into MDX lessons and example maps."""

from __future__ import annotations

import html
from functools import lru_cache
from xml.etree import ElementTree
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
PY_SOURCE = Path('/home/mashiro/Development/JavaScript/python101/docs/th')
GIT_SOURCE = Path('/home/mashiro/Development/JavaScript/git101/docs/th')
LESSONS = ROOT / 'src/content/lessons'
EXAMPLES = ROOT / 'src/content/examples'
DIAGRAMS = ROOT / 'public/diagrams'
PROVENANCE = ROOT / 'docs/editorial/provenance'

GROUPS = {
    'python101': [
        ('/tmp/dssi-claude-python-a3.json', PY_SOURCE),
        ('/tmp/dssi-claude-python-a4.json', PY_SOURCE),
        ('/tmp/dssi-claude-python-b2.json', PY_SOURCE),
    ],
    'git101': [
        ('/tmp/dssi-claude-git-a.json', GIT_SOURCE),
        ('/tmp/dssi-claude-git-b.json', GIT_SOURCE),
    ],
}

FRONTMATTER = re.compile(r'^---\n.*?\n---\n?', re.S)
FENCED = re.compile(r'^```([^\n]*)\n(.*?)^```\s*', re.M | re.S)
INLINE = re.compile(r'(?<!`)`([^`\n]+)`(?!`)')
LINK = re.compile(r'(?P<whole>\[[^\]]+\])\((?P<target>[^)]+)\)')


def result_files(path: str) -> dict[str, str]:
    response = json.loads(Path(path).read_text())
    if response.get('type') != 'result' or response.get('is_error'):
        raise RuntimeError(f'Claude task failed: {path}')
    raw = response['result']
    match = re.search(r'```json\s*(\{.*?\})\s*```', raw, re.S)
    if not match:
        raise RuntimeError(f'Claude output has no JSON block: {path}')
    value = json.loads(match.group(1))
    if not isinstance(value.get('files'), dict):
        raise RuntimeError(f'Claude output has no files map: {path}')
    return value['files']


def source_slug(text: str) -> str:
    return text.removesuffix('.md').removesuffix('.mdx')


def replace_links(text: str, section: str) -> str:
    def repl(match: re.Match[str]) -> str:
        target = match.group('target')
        if target.startswith('./') and target.endswith('.md'):
            return f"{match.group('whole')}(/learn/{section}/{source_slug(target[2:])}/)"
        return match.group(0)

    return LINK.sub(repl, text)


def svg_for_mermaid(section: str, lesson: str, index: int, source: str) -> tuple[str, str]:
    """Use the reviewed SVG, preserving branches and loop-back arrows."""
    filename = f'{section}-{lesson}-{index}.svg'
    path = DIAGRAMS / filename
    if not path.exists():
        raise RuntimeError('Run render-diagrams.py before migration: ' + filename)
    svg = ElementTree.fromstring(path.read_text())
    title = svg.find('{http://www.w3.org/2000/svg}title').text
    description = svg.find('{http://www.w3.org/2000/svg}desc').text
    fallback = f'<figure class="diagram"><img src="/diagrams/{filename}" alt="{html.escape(title)}" /><figcaption>{html.escape(description)}</figcaption></figure>'
    return filename, fallback


@lru_cache(maxsize=1)
def claude_notes() -> dict:
    notes = {}
    for filename in ['notes-python-1', 'notes-python-2', 'notes-git']:
        path = Path('/tmp/dssi-claude-' + filename + '.json')
        response = json.loads(path.read_text())
        if response.get('type') != 'result' or response.get('is_error'):
            raise RuntimeError(f'Claude annotations failed: {path}')
        text = response['result']
        value, _ = json.JSONDecoder().raw_decode(text[text.index('{'):])
        notes.update(value['examples'])
    return notes


def migrate_doc(section: str, source_root: Path, key: str, rewritten: str, examples: dict, diagrams: list[dict]) -> dict:
    lesson = source_slug(key)
    original = (source_root / key).read_text()
    # Guard the protected content before changing the prose shape.
    original_blocks = [(m.group(1), m.group(2)) for m in FENCED.finditer(original)]
    rewritten_blocks = [(m.group(1), m.group(2)) for m in FENCED.finditer(rewritten)]
    if original_blocks != rewritten_blocks:
        raise RuntimeError(f'protected fenced block mismatch: {section}/{key}')
    if INLINE.findall(original) != INLINE.findall(rewritten):
        raise RuntimeError(f'protected inline code mismatch: {section}/{key}')
    original_links = [m.group('target') for m in LINK.finditer(original)]
    rewritten_links = [m.group('target') for m in LINK.finditer(rewritten)]
    if original_links != rewritten_links:
        raise RuntimeError(f'protected links mismatch: {section}/{key}')

    meta_match = re.match(r'^---\n(.*?)\n---\n?', rewritten, re.S)
    if not meta_match:
        raise RuntimeError(f'missing frontmatter: {section}/{key}')
    meta: dict[str, str] = {}
    for line in meta_match.group(1).splitlines():
        if ':' in line:
            name, value = line.split(':', 1)
            meta[name.strip()] = value.strip()
    body = rewritten[meta_match.end():]
    body = re.sub(r'^\s*# .+\n+', '', body, count=1)
    body = replace_links(body, section)

    out_parts: list[str] = []
    cursor = 0
    last_example_id: str | None = None
    block_index = 0
    for match in FENCED.finditer(body):
        out_parts.append(body[cursor:match.start()])
        language, code = match.group(1).strip(), match.group(2)
        block_index += 1
        if language.lower() == 'mermaid':
            filename, fallback = svg_for_mermaid(section, lesson, len([d for d in diagrams if d['lesson'] == lesson]) + 1, code)
            diagrams.append({'section': section, 'lesson': lesson, 'file': filename, 'source': code})
            out_parts.append(fallback + '\n')
            cursor = match.end()
            continue
        if language.lower() in {'text', 'txt', 'console'} and last_example_id:
            examples[last_example_id]['output'] = code.rstrip('\n')
            cursor = match.end()
            continue
        example_id = f'{section}-{lesson}-{block_index:02d}'
        lines = code.rstrip('\n').split('\n')
        status = 'working'
        # Only the source's explicit demonstration of adding a string and an
        # integer is intentionally broken. Nearby headings such as
        # "ข้อผิดพลาดที่พบบ่อย" also contain valid fixes, so do not infer a
        # broken status from prose distance.
        error: str | None = None
        if section == 'python101' and lesson == 'basics' and block_index == 6:
            status = 'broken'
            error = 'age เป็นข้อความ จึงนำไปบวกกับจำนวนเต็ม 1 ตรง ๆ ไม่ได้และทำให้เกิด TypeError'
        authored = claude_notes().get(example_id)
        if not authored:
            raise RuntimeError(f'Missing authored line explanations for {example_id}')
        examples[example_id] = {
            'id': example_id,
            'language': language or 'text',
            'code': code.rstrip('\n'),
            'notes': authored['notes'],
            'status': status,
            'title': authored['title'],
        }
        if error:
            examples[example_id]['error'] = error
        out_parts.append(f"<CodeExample example={{examples['{example_id}']}} />\n")
        last_example_id = example_id
        cursor = match.end()
    out_parts.append(body[cursor:])
    content = '\n'.join([
        '---',
        f"section: {section}",
        f"title: {meta.get('title', lesson)}",
        f"description: {meta.get('description', '')}",
        f'order: {ORDER[section][lesson]}',
        f'source: {section}/{key}',
        'draft: false',
        '---',
        '',
        "import CodeExample from '../../../components/CodeExample.astro';",
        f"import examples from '../../../content/examples/{section}.json';",
        '',
        ''.join(out_parts).strip(),
        '',
    ])
    out_path = LESSONS / section / f'{lesson}.mdx'
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(content)
    return {'section': section, 'file': str(out_path.relative_to(ROOT)), 'source': str(source_root / key), 'claude_file': key, 'protected_blocks': len(original_blocks), 'examples': block_index}


ORDER = {
    'python101': {'setup': 1, 'basics': 2, 'input-output': 3, 'conditions': 4, 'loops': 5, 'data-structures': 6, 'functions': 7, 'files': 8, 'errors': 9, 'modules': 10, 'oop': 11, 'roadmap': 12, 'projects': 13, 'index': 0},
    'git101': {'setup': 1, 'basics': 2, 'repository': 3, 'staging-commits': 4, 'history': 5, 'branching': 6, 'merging': 7, 'collaboration': 8, 'remote': 9, 'undo': 10, 'roadmap': 11, 'projects': 12, 'index': 0},
}


def main() -> None:
    LESSONS.mkdir(parents=True, exist_ok=True)
    EXAMPLES.mkdir(parents=True, exist_ok=True)
    DIAGRAMS.mkdir(parents=True, exist_ok=True)
    PROVENANCE.mkdir(parents=True, exist_ok=True)
    manifest = {'version': 1, 'status': 'pending-technical-review', 'sections': {}, 'diagrams': [], 'claude_results': []}
    for section, batches in GROUPS.items():
        examples: dict[str, dict] = {}
        diagrams: list[dict] = []
        records: list[dict] = []
        combined: dict[str, str] = {}
        for result, source_root in batches:
            if not Path(result).exists():
                continue
            files = result_files(result)
            manifest['claude_results'].append(result)
            for key, value in files.items():
                combined[key] = value
        for key in sorted(combined):
            records.append(migrate_doc(section, next((root for result, root in batches if (root / key).exists()), PY_SOURCE), key, combined[key], examples, diagrams))
        (EXAMPLES / f'{section}.json').write_text(json.dumps(examples, ensure_ascii=False, indent=2) + '\n')
        manifest['sections'][section] = records
        manifest['diagrams'].extend(diagrams)
    (PROVENANCE / 'claude-rewrites.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    (ROOT / 'docs/editorial').mkdir(parents=True, exist_ok=True)
    manifest_path = ROOT / 'docs/editorial/manifest.json'
    if not manifest_path.exists():
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps({'sections': {k: len(v) for k, v in manifest['sections'].items()}, 'examples': {k: len(json.loads((EXAMPLES / f'{k}.json').read_text())) for k in manifest['sections']}}, ensure_ascii=False))


if __name__ == '__main__':
    main()
