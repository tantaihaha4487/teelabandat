import type { SearchEntry } from "./types";

export function normalizeSearch(value: string): string {
  return value
    .normalize("NFC")
    .toLocaleLowerCase("th-TH")
    .trim()
    .replace(/\s+/g, " ");
}

export function searchEntries(
  entries: SearchEntry[],
  query: string,
): SearchEntry[] {
  const norm = normalizeSearch(query);
  if (!norm) return [];

  const tokens = norm.split(" ");
  const results: { entry: SearchEntry; score: number; idx: number }[] = [];

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const t = normalizeSearch(e.title);
    const d = normalizeSearch(e.description);
    const b = normalizeSearch(e.body);
    const s = normalizeSearch(e.section);
    const combined = `${t} ${d} ${b} ${s}`;

    if (!tokens.every((tk) => combined.includes(tk))) continue;

    let score = 0;
    for (const tk of tokens) {
      if (t.includes(tk)) score += 30;
      if (d.includes(tk)) score += 15;
      if (b.includes(tk)) score += 5;
    }
    if (t === norm) score += 9;
    if (t.includes(norm)) score += 12;
    else if (d.includes(norm)) score += 8;
    else if (b.includes(norm)) score += 3;

    results.push({ entry: e, score, idx: i });
  }

  results.sort((a, b) => b.score - a.score || a.idx - b.idx);
  return results.map((r) => r.entry);
}
