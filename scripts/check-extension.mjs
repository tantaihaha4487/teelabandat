import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const id = "extension-check-temporary";
const section = path.resolve("src/content/sections", id + ".json");
const dir = path.resolve("src/content/lessons", id);
if (fs.existsSync(section) || fs.existsSync(dir))
  throw new Error("Temporary section already exists; refusing to overwrite.");
function build() {
  const result = spawnSync("bun", ["run", "build"], { encoding: "utf8" });
  if (result.status !== 0)
    throw new Error(result.stdout + "\n" + result.stderr);
}
let failure;
try {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    section,
    JSON.stringify({
      id,
      title: "หมวดตรวจการขยาย",
      summary: "ตรวจเมนูที่สร้างจากข้อมูล",
      order: 999,
      kind: "course",
      label: "หมวดตรวจ",
      icon: "book",
    }),
  );
  fs.writeFileSync(
    path.join(dir, "first.mdx"),
    "---\nsection: " +
      id +
      "\ntitle: บทตรวจการขยาย\ndescription: ตรวจเส้นทางจากเนื้อหา\norder: 1\nsource: internal-extension-check\ndraft: false\n---\n\n## เนื้อหาทดสอบ\n\nตรวจว่าเพิ่มบทได้โดยไม่แก้แม่แบบ\n",
  );
  build();
  for (const route of [
    `dist/learn/${id}/index.html`,
    `dist/learn/${id}/first/index.html`,
  ])
    if (!fs.existsSync(route))
      throw new Error("Missing generated route " + route);
  const home = fs.readFileSync("dist/index.html", "utf8");
  if (!home.includes(`/learn/${id}/`))
    throw new Error("New section is absent from automatic home index.");
  console.log(
    "New section and lesson generated without layout or navigation edits.",
  );
} catch (error) {
  failure = error;
} finally {
  fs.rmSync(section, { force: true });
  fs.rmSync(dir, { recursive: true, force: true });
  build();
}
if (failure) throw failure;
if (fs.existsSync(`dist/learn/${id}/index.html`))
  throw new Error("Temporary route remains after cleanup.");
console.log("Temporary section removed and original build restored.");
