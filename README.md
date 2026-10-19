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

![Teelabandat home page with the purple "บรรทัด" headline pill, Mashiro on a rotating scalloped shape, and a one-line code card](docs/assets/home-preview.jpg)

## Read it, try it, move on

- 27 lessons across Python and Git, written for people who have never programmed, with 109 annotated code examples
- A step player for longer examples: it highlights the running line and shows variable values and output at each step, and the controls stay put while you step
- Step diagrams in the lessons for sequences like add, commit and push, or try, except and continue
- Editable values in examples that offer an input field, with Python running in the browser
- 73 Python exercises with hints and worked reasoning; Mashiro reacts to right and wrong answers
- Search in Thai or by command name, on phones or desktops

No account is required. Exercise answers live in page memory and disappear on refresh. Learning progress is not stored.

<details>
<summary><strong>See the step player</strong></summary>

![The fruits loop example paused at line 3, with the explanation, variable values and output beside the code](docs/assets/console-preview.jpg)

Short examples skip the player and show their output with a one-line explanation, so there is nothing to click through.

</details>

## How it looks and moves

The interface uses Material 3 Expressive color roles and shapes built from the brand purple, on warm paper surfaces. It follows the system light or dark setting. Motion values come from the Swiftify design reference: springy hover growth, scalloped edges on hovered course tiles, a fade and short rise between pages, and section shapes that carry over from the home page to the course page. Only transform and opacity animate. With reduced motion turned on, loops stop, the animated mascot switches to a still image, and movement is replaced by fades.

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
| Mascot stills and animations | `public/mascot/` |

See [CONTENT.md](CONTENT.md) and [docs/HOW_TO_ADD_LESSONS.md](docs/HOW_TO_ADD_LESSONS.md) for authoring instructions, and [DESIGN.md](DESIGN.md) for the interface and motion rules. Lessons can use the `Flow` component for step diagrams.

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

Editing notes and Humanizer provenance are in [docs/editorial](docs/editorial). Mascot sources and how the animated stickers were exported are in [docs/mascot-assets.md](docs/mascot-assets.md).

</details>

---

<p align="center">
  <img src="public/mascot/nap.webp" width="104" height="104" alt="Mashiro napping in front of a laptop" /><br />
  <sub>Learn at your own pace</sub>
</p>
