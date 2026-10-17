import { defineCollection } from "astro:content";
import { z } from "astro/zod";
import { glob } from "astro/loaders";
const sections = defineCollection({
  loader: glob({
    pattern: "*.json",
    base: "./src/content/sections",
    generateId: ({ entry }) => entry.replace(/\.json$/, ""),
  }),
  schema: z.object({
    id: z.string(),
    title: z.string(),
    summary: z.string(),
    order: z.number(),
    kind: z.enum(["course", "practice"]),
    label: z.string(),
    icon: z.enum(["code", "branch", "practice", "book"]),
    bank: z.string().optional(),
  }),
});
const lessons = defineCollection({
  loader: glob({
    pattern: "**/*.{md,mdx}",
    base: "./src/content/lessons",
    generateId: ({ entry }) => entry.replace(/\.(md|mdx)$/, ""),
  }),
  schema: z.object({
    section: z.string(),
    title: z.string(),
    description: z.string(),
    order: z.number(),
    source: z.string(),
    draft: z.boolean().default(false),
  }),
});
export const collections = { sections, lessons };
