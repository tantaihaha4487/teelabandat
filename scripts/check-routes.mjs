import fs from "node:fs";
import path from "node:path";
import { parse } from "yaml";

const root = process.cwd();
const dist = path.join(root, "dist");
const errors = [];
function files(dir, ext) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir, { withFileTypes: true })
    .flatMap((e) =>
      e.isDirectory()
        ? files(path.join(dir, e.name), ext)
        : e.name.endsWith(ext)
          ? [path.join(dir, e.name)]
          : [],
    );
}
function htmlTarget(urlPath) {
  const target = path.join(dist, decodeURIComponent(urlPath));
  if (fs.existsSync(target) && fs.statSync(target).isFile()) return target;
  if (fs.existsSync(path.join(target, "index.html")))
    return path.join(target, "index.html");
  if (fs.existsSync(target + ".html")) return target + ".html";
  return null;
}
if (!fs.existsSync(dist))
  throw new Error("ไม่พบ dist ให้รัน bun run build ก่อน");
const built = files(dist, ".html");
for (const file of built) {
  const html = fs.readFileSync(file, "utf8");
  const pathname =
    "/" +
    path
      .relative(dist, file)
      .replaceAll(path.sep, "/")
      .replace(/index\.html$/, "");
  for (const match of html.matchAll(/\bhref=["']([^"']*)["']/g)) {
    const href = match[1].replaceAll("&amp;", "&");
    if (!href || /^(?:https?:|mailto:|tel:|javascript:|data:)/i.test(href))
      continue;
    let parsed;
    try {
      parsed = new URL(href, "https://local.invalid" + pathname);
    } catch {
      errors.push(`${pathname}: invalid URL ${href}`);
      continue;
    }
    if (parsed.host !== "local.invalid") continue;
    const target = htmlTarget(parsed.pathname);
    if (!target) {
      errors.push(`${pathname}: missing ${href}`);
      continue;
    }
    if (parsed.hash && target.endsWith(".html")) {
      const id = decodeURIComponent(parsed.hash.slice(1));
      const dest = target === file ? html : fs.readFileSync(target, "utf8");
      const ids = [...dest.matchAll(/\bid=["']([^"']+)["']/g)].map((m) => m[1]);
      if (!ids.includes(id)) errors.push(`${pathname}: missing anchor ${href}`);
    }
  }
}
for (const file of files(path.join(root, "src/content/sections"), ".json")) {
  const section = JSON.parse(fs.readFileSync(file, "utf8"));
  const url =
    section.kind === "practice"
      ? `/practice/${section.bank || section.id}/`
      : `/learn/${section.id}/`;
  if (!htmlTarget(url)) errors.push(`missing section route ${url}`);
}
for (const file of files(path.join(root, "src/content/lessons"), ".mdx")) {
  const text = fs.readFileSync(file, "utf8");
  const data = parse(text.match(/^---\s*\n([\s\S]*?)\n---/)?.[1] || "");
  if (!data || data.draft) continue;
  const slug = path.relative(path.join(root, "src/content/lessons", data.section), file).replaceAll(path.sep, "/").replace(/\.mdx$/, "");
  const url = `/learn/${data.section}/${slug}/`;
  if (!htmlTarget(url)) errors.push(`missing lesson route ${url}`);
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exit(1);
}
console.log(
  `Routes and local anchors valid across ${built.length} HTML files.`,
);
