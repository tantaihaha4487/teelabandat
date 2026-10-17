import { getCollection } from "astro:content";
import type { QuizBank, SectionData, SearchEntry } from "./types";
import path from "node:path";

export async function sections() {
  return (await getCollection("sections"))
    .map((s) => s.data)
    .sort((a, b) => a.order - b.order);
}
export async function lessons() {
  return (await getCollection("lessons", ({ data }) => !data.draft)).sort(
    (a, b) => a.data.order - b.data.order || a.id.localeCompare(b.id),
  );
}
export function lessonUrl(lesson: { id: string; data: { section: string } }) {
  const slug = lesson.id.replace(/^.*?\//, "").replace(/\.(md|mdx)$/, "");
  return `/learn/${lesson.data.section}/${slug}/`;
}
export function sectionUrl(section: SectionData) {
  return section.kind === "practice"
    ? `/practice/${section.bank || section.id}/`
    : `/learn/${section.id}/`;
}
export function banks(): QuizBank[] {
  const modules = import.meta.glob<{ default: QuizBank }>(
    "../data/*-bank.json",
    { eager: true },
  );
  return Object.values(modules).map((m) => m.default);
}
export async function searchIndex(): Promise<SearchEntry[]> {
  const all = await lessons();
  const sectionLabels = new Map((await sections()).map(s => [s.id, s.label]));
  const examples = import.meta.glob<{
    default: Record<string, { code: string; notes: { note: string }[] }>;
  }>("../content/examples/*.json", { eager: true });
  function exampleText(id: string, body: string) {
    const imported = [
      ...body.matchAll(/import\s+\w+\s+from\s+['"]([^'"]+\.json)['"]/g),
    ];
    const usedIds = new Set(
      [...body.matchAll(/examples\[['"]([^'"]+)['"]\]/g)].map((m) => m[1]),
    );
    return imported
      .flatMap((m) => {
        const resolved = path.posix.normalize(
          path.posix.join("src/content/lessons", path.posix.dirname(id), m[1]),
        );
        const module = Object.entries(examples).find(
          ([key]) => key.replace(/^\.\.\//, "src/") === resolved,
        )?.[1];
        return module
          ? Object.entries(module.default)
              .filter(([key]) => usedIds.has(key))
              .map(
                ([, e]) => e.code + " " + e.notes.map((n) => n.note).join(" "),
              )
          : [];
      })
      .join(" ");
  }
  const entries: SearchEntry[] = all.map((lesson) => ({
    id: lesson.id,
    type: "lesson",
    title: lesson.data.title,
    description: lesson.data.description,
    section: sectionLabels.get(lesson.data.section) || lesson.data.section,
    url: lessonUrl(lesson),
    body: (
      (lesson.body || "")
        .replace(/^import .*$/gm, "")
        .replace(/<[^>]*>/g, " ")
        .replace(/[#*`{}]/g, " ") +
      " " +
      exampleText(lesson.id, lesson.body || "")
    ).replace(/\s+/g, " "),
  }));
  for (const bank of banks())
    for (const q of bank.questions)
      entries.push({
        id: `${bank.id}-${q.sourceId}`,
        type: "question",
        title: `โจทย์ข้อ ${q.sourceId}`,
        description: q.prompt,
        section: bank.title,
        url: `/practice/${bank.id}/?question=${q.sourceId}`,
        body: q.prompt + " " + q.code,
      });
  return entries;
}
