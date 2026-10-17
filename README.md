<p align="center">
  <img src="public/mascot/sparkling.webp" width="144" height="144" alt="Mashiro, the cat mascot, with sparkling eyes" />
</p>
<h1 align="center">ทีละบรรทัด (Teelabandat)</h1>
<p align="center"><strong>Read the code until it makes sense, then change a value and see what happens</strong></p>
<p align="center">A Thai-language site for learning Python and Git from the beginning.<br />Mashiro reads along, the code is there to try, and the exercises are there to review.</p>
<p align="center">Mascot artwork by <a href="https://x.com/fuffi_fufi">@fuffi_fufi</a>.</p>
<p align="center">
  <img alt="Astro 7.4.0" src="https://img.shields.io/badge/Astro-7.4.0-6741a5?style=flat-square" />
  <img alt="Vue 3.5.44" src="https://img.shields.io/badge/Vue-3.5.44-346044?style=flat-square" />
  <img alt="Bun: project tooling" src="https://img.shields.io/badge/Bun-project%20tooling-51465c?style=flat-square" />
  <img alt="Content: Thai" src="https://img.shields.io/badge/content-Thai-6741a5?style=flat-square" />
</p>

![Teelabandat home page showing the Python and Git table of contents and the Mashiro mascot](docs/assets/home-preview.jpg)

## Read it, try it, move on

- **27 lessons** across Python and Git, with **109 code examples**
- **Examples short enough to fit one box**, with dark code panels separated from light output panels
- **Step-by-step execution**: the line being run, the variable values, and the output at each point
- **Editable values** in the examples that provide an input field, running Python in the browser
- **Autoplay, pause, or slow down** to whatever pace suits you
- **73 Python exercises** with answers and explanations
- Search in Thai or by command name, on mobile or desktop

No account is required. Exercise answers are held in page memory and disappear on refresh. Learning progress is not stored.

<details>
<summary><strong>See an example code box and its output</strong></summary>

![A Python type-checking example with the code and the output shown separately](docs/assets/console-preview.jpg)

Complex examples have a step player. Short examples show the output with a brief explanation, so there is nothing to click through.

</details>

## Run it locally

You need **Node.js 22.22.0 or later** and **Bun**.

```sh
git clone https://github.com/tantaihaha4487/teelabandat.git
cd teelabandat
bun install
bun run dev
```

Open the URL printed in the terminal, usually `http://127.0.0.1:4321/`.

### Build for deployment

```sh
bun run build
bun run preview
```

The site files land in `dist/` and can go on any host that serves static sites. There is no API key or database to configure.

Python runs in a Web Worker through Pyodide, which is copied alongside the site when the dev server starts or when you build, and loads when you press run. Git lessons show commands and explanations; they do not run a shell on the learner's machine.

## Add your own lessons

Content is separate from the interface. Add a section and its lessons, and the table of contents and menu update from that data.

| What you want to change | Where it lives |
| --- | --- |
| Learning sections | `src/content/sections/` |
| Lessons | `src/content/lessons/` |
| Code examples | `src/content/examples/` |
| Steps, variable values, and input fields | `src/content/teaching/` |
| Exercise bank | `src/data/python-bank.json` |
| Mascot | `public/mascot/` |

See [CONTENT.md](CONTENT.md) for content authoring instructions in Thai, and [DESIGN.md](DESIGN.md) for interface guidelines in English.

<details>
<summary><strong>Checking commands and content sources</strong></summary>

```sh
bun run validate       # check content structure and example data
bun run check          # check Astro and TypeScript
bun run build          # check content and build the site
bun run check:routes   # check links and routes from dist/
```

Comparison against the original Python101, Git101, and Wayo material runs only when the reference files are present locally. Without them, only that comparison is skipped, and the command output says so.

The content is adapted from Python101, Git101, and the Wayo exercise bank, keeping the original code, commands, output, and option ordering. Examples written for debugging practice still contain their original mistakes and are labeled as such.

Editing notes for Claude and Humanizer are in [docs/editorial](docs/editorial) (in Thai). Mascot sources are listed in [docs/mascot-assets.md](docs/mascot-assets.md) (in English).

</details>

---

<p align="center">
  <img src="public/mascot/nap.webp" width="104" height="104" alt="Mashiro napping in front of a laptop" /><br />
  <sub>Learn at your own pace</sub>
</p>
