# sizzlr: plan

Turn plans and pull requests into short narrated review videos: two voices, animated scenes,
real code, real numbers, rendered locally with no API keys. Built for coding agents (Claude Code,
Codex) that already read the plan or PR; sizzlr gives them a way to tell it back.

> "Turn plans and PRs into a two-voice review video, locally, no keys."

## Why

Engineers read a lot: code, plans, AI conversations, PR descriptions. A 90-second video with a
reviewer and an author talking through the change, the decisions to check and the evidence is
easier to take in than a wall of text, and it is cheap when an agent already has the context.

## What a prototype proved

A spike in a cloud coding session (no GPU, 4 vCPU) produced finished videos from real PRs and plans:

| Example | Length | Render |
| --- | --- | --- |
| Small rule change PR (screenshot zoom, before/after illustration) | 37 s | 113 s |
| Performance PR (charts from the PR's benchmark tables) | 61 s | ~4 min (old style) |
| 2,500-word feature plan, six chapters | 2 min 31 s | 6.5 min |
| 5,500-word plan, script written by a fresh agent from the skill alone | 119 s | 5 min (old style) |

Measured, not guessed:

- **Cost of a video:** the script is written by the agent that already runs. A fresh agent writing
  a script from a 5,500-word plan used 8 model calls (675k cached tokens read, 114k written, 13k
  output), about $1 at Claude Opus 5.5 API prices. Voices and rendering are local CPU, free.
- **Render speed:** about 2.6-3x real time at 1080p30 in the flat default style; 2x slower with
  moving backgrounds and camera drift, which is why they are off by default.
- **Accuracy:** a fresh agent following only the skill produced a script where every number and
  decision checked out against the source. Two failures it made (too long, an overfull scene) are
  now caught by the tool instead of the agent.
- **Element choice matters more than effects:** an agent left to its own devices drew a bar chart
  comparing two font sizes. The fix is a closed element catalogue with "use when / never for"
  rules, not more freedom.

Look agreed after review: white or near-white, neutral cool greys, flat, two distinct voices,
word-by-word captions, quiet sound effects, punch-ins on punchlines. No moving backgrounds, no
camera drift, no avatar motion, no badges in the corner. The speaking person is shown in full,
the other dimmed.

## Landscape

Close relatives exist; none combine plans, review structure, two voices and zero keys:

- `diffcast` / `prdemo` (npm): records a browser demo of a web app for a PR; needs an OpenRouter key.
- `create-explainer-videos` (GitHub): agent skill for articles, papers, PRs; Remotion; nicer voices
  need a key; one narrator.
- `/explain-vid` (blog): hosted GitHub bot, HyperFrames + ElevenLabs, PRs only.
- `diffreel` (npm): animates code morphing, no narration. A candidate building block for code scenes.
- Hosted document-to-video products (ChatGPT's Explain Video Generator, Knowlify, NoteGPT).

sizzlr's angle: **plans and specs first-class** (chapters, rule references), **review structure**
(decisions to check, evidence, what is open), **a reviewer/author dialogue**, **strict fact
grounding with a closed element catalogue**, **fully local, no keys**, **themeable from one file**.

## How it works

```
plan.md / PR ──agent + skill──▶ script.json          what is said, by whom, and which element is on screen
script.json  ──sizzlr build──▶  voice per line        Kokoro-82M, local, cached by voice + text
                                timeline              silence trimmed; each scene as long as its lines
                                project               HTML scenes + native Web Animations + audio clips
             ──sizzlr snapshot─▶ contact sheet PNG    the agent looks before rendering
             ──sizzlr render──▶  video.mp4            HyperFrames: headless Chrome seeks every frame, FFmpeg encodes
```

Principles:

- **Audio drives the timeline.** The agent never writes timestamps. Items appear `at` a line (and
  optionally a `word`) of the scene, so visuals land on the words that introduce them.
- **The agent writes data first, HTML when it has to.** The catalogue's scene types keep videos
  consistent, make scripts cheap to write and easy to check, and let the look change without
  touching scripts. When nothing fits, or the user asks for something specific, the `custom`
  element takes the agent's own HTML and CSS inside the same frame: captions, speakers, timing,
  transitions and sound stay sizzlr's.
- **Every fact comes from the source.** Code on screen is copied from the diff; numbers are not
  rounded into new meanings; UI illustrations say they are illustrations.
- **No animation library.** Animations are data emitted as native Web Animations; counters are
  drawn from HyperFrames' seek event. (GSAP's licence restricts tools that let people create
  animations without code, so it is not used.)

## The package

One npm package, `sizzlr`, is the engine and CLI. A thin skill on top tells agents how to use it.

```
sizzlr/
  package.json              bin: sizzlr; engines: node >=22
  src/
    cli.ts                  init | doctor | voices | lint | build | snapshot | render | skill
    config.ts               sizzlr.config.json: load, defaults, validate (zod)
    schema.ts               script.json schema (zod), also emitted as JSON Schema for agents
    tts.ts                  Kokoro through `hyperframes tts`, cache, silence trimming, word timing
    timeline.ts             line, word and scene timing
    animate.ts              animation data -> Web Animations script; counters via hf-seek
    compose.ts              page: scenes, captions, speakers, audio, sound effects, fit-to-frame
    scenes/                 one module per element: markup + animation data
    lint.ts                 length vs target, line length, items per scene, catalogue rules
  styles/                   base.css, portrait.css (layout only; colours are tokens from the config)
  assets/fonts/             Geist + Geist Mono (SIL OFL), the defaults
  assets/sfx/               whoosh, pop, thud, ding (synthesised with FFmpeg, no licence questions)
  skills/sizzlr/SKILL.md    the agent instructions: workflow + element catalogue
  .claude-plugin/           plugin + marketplace manifests for Claude Code
  examples/                 example scripts (neutral content)
  test/                     schema, timing golden files, one 3-second render in CI
```

### CLI

| Command | Does |
| --- | --- |
| `sizzlr init` | writes `sizzlr.config.json` and installs the skill for Claude Code (`.claude/skills/sizzlr/`) and Codex (`.agents/skills/sizzlr/`); `--global` for the personal folders |
| `sizzlr doctor` | checks Node, FFmpeg, Chrome, Python + kokoro-onnx, the voice model; prints the one command that fixes each |
| `sizzlr voices` | lists voices with a quality hint |
| `sizzlr lint <dir>` | schema errors, unknown fields, estimated length vs target, overlong lines, catalogue rules |
| `sizzlr build <dir>` | voices + project; prints the length; warns when over the target |
| `sizzlr snapshot <dir> --at 2,10,20` | contact sheet for the agent to check |
| `sizzlr render <dir>` | MP4 next to `script.json` (draft quality by default; `--quality standard`, `--format gif` for a PR teaser) |

### Skill installation, Claude Code and Codex

Both use the same open format: a folder with a `SKILL.md` that starts with `name` and
`description`. One source file, three ways in:

1. `npx sizzlr init`: copies the skill into `.claude/skills/sizzlr/` and `.agents/skills/sizzlr/`.
2. Claude Code plugin: `/plugin marketplace add santosch/sizzlr`, then `/plugin install sizzlr@sizzlr`.
3. The open skills installer: `npx skills add santosch/sizzlr` (Claude Code, Codex, Cursor and others).

The skill calls `npx sizzlr@<major>` so skill and engine stay in step; a skill from one version
never drives a different major of the engine.

### Config: `sizzlr.config.json`

Everything brand-specific; nothing company-specific ships in the package.

```json
{
  "brand": { "name": "Acme" },
  "font": {
    "sans": { "family": "Inter", "files": [{ "path": "fonts/Inter-Regular.otf", "weight": 400 }, { "path": "fonts/Inter-Bold.otf", "weight": 700 }] },
    "mono": { "family": "JetBrains Mono", "file": "fonts/JetBrainsMono-Variable.woff2" }
  },
  "colors": {
    "light": { "background": "#ffffff", "surface": "#ffffff", "ink": "#18181b", "muted": "#6b7280", "line": "#e5e7eb",
               "accent": "#5b5bd6", "second": "#3f3f46", "good": "#2e8b6b", "warn": "#c98a2b", "bad": "#d4563f", "highlight": "#fde68a" },
    "dark": { "...": "same keys" }
  },
  "voices": [{ "voice": "af_heart", "speed": 1.2 }, { "voice": "bm_george", "speed": 1.15 }],
  "style": { "background": "flat | dots | glow", "cameraDrift": false, "soundEffects": true, "disclaimer": "outro | corner | none" },
  "render": { "quality": "draft", "fps": 30 }
}
```

- Fonts: one variable file or several static weights; woff2, woff, ttf or otf.
- Voices: a script's cast members without a voice take the first configured voice nobody in the
  cast uses yet, so scripts stay portable and two speakers never share a voice.
- Style switches default to the calm, fast-rendering version.

### Element catalogue (the heart of the skill)

| Purpose | Element | Use when | Never for |
| --- | --- | --- | --- |
| Hook | `punch` | the first 3-5 s: the problem or claim in under 8 words | a summary |
| Hook | `title` | a calm start | — |
| Evidence | `big` | one striking measured number | counts nobody cares about |
| Show the product | `shot` | a real screenshot: zoom into 1-3 regions with labels | invented screens |
| Show the product | `compare` | rules about how UI looks, before/after of layout or copy: an illustration with a verdict per panel | something you could screenshot |
| Explain a change | `code` | the 2-6 lines of the diff that are the change | whole files |
| Explain a flow | `chain` | a short straight sequence: steps, escalations, slices | unordered lists, anything that branches |
| Explain a system | `diagram` | flowcharts, sequence diagrams, state machines, entity relations: the agent writes Mermaid, nodes and arrows appear as they are mentioned | decoration, a list that is really a sequence |
| Explain structure | `layers` | levels that build on each other (privacy, permissions) | unrelated items |
| Evidence | `chart` | measured values with a real gap: time, memory, size, cost; bars, lines or areas; a limit line | config values, font sizes, two numbers you can just say |
| Evidence | `stats` / `checks` | 2-3 headline numbers / what was verified | more than 3 / — |
| Decisions | `decisions` | 3-5 things a reviewer should check | trivia |
| Scope | `chips` | what is included, 3-7 labels | — |
| Structure | `chapter`, `todo` | videos over 2 minutes; what is next or open | short videos |
| Ending | `outro` | where to read more | — |
| Anything else | `custom` | no element fits, or the user asks for something specific: the agent's own HTML and CSS | restyling an element that exists |

`custom` keeps the video coherent:

- Elements marked `data-at="1"` (and optionally `data-word="4"`) appear when that line or word is
  spoken, with `data-anim="pop | slide | fade | draw"`. No timestamps, same as every other element.
- The CSS can use the theme's tokens (`var(--accent)`, `var(--good)`, ...) and is scoped to the
  scene automatically.
- An optional `render(t)` draws on canvas or SVG as a pure function of time (HyperFrames seeks
  frames out of order), e.g. a packet moving through an architecture sketch.
- Rendering blocks network requests, so agent-written HTML cannot load anything remote. The
  snapshot check stays mandatory.

### Graphs and diagrams

The prototype draws charts and chains with plain HTML: bars are positioned boxes, gridlines are
lines, chains are boxes with arrows. No dependencies, theme colours for free, fast to render, but
limited to bars and straight sequences. The package adds:

- **`diagram` with Mermaid (MIT).** Agents write Mermaid fluently. sizzlr renders it to SVG at
  build time with the config's fonts and colours, then reveals nodes and edges in narration order.
  Plans benefit most: a status workflow becomes a state diagram, the new tables an ER diagram.
- **Charts as SVG with `d3-scale` and `d3-shape` (ISC).** Line and area charts and proper axes
  without a chart framework; bars stay as simple as now.

### Outputs next to every video

- `video.mp4`, with chapter markers players understand.
- `video.vtt`: subtitles from the word timings sizzlr already has.
- `video.md`: the transcript with chapter timestamps, so a video can be skimmed and searched.
- `video.gif` and `video.png`: a short teaser and a poster for PR comments that do not play video.

### Compatibility and honesty

- `script.json` carries `"version": 1`; old scripts keep rendering as elements evolve.
- Languages: Kokoro is good in English; other languages vary, and German only exists as community
  voices. The README says so.
- sizzlr sends no telemetry and switches off HyperFrames' own.

## Dependencies and licences

| Dependency | Licence | Note |
| --- | --- | --- |
| hyperframes | Apache-2.0 | pinned exactly; sends usage telemetry by default, so sizzlr always sets `DO_NOT_TRACK=1` |
| Kokoro-82M weights + kokoro-onnx (pip) | Apache-2.0 / MIT | installed by the user, not bundled; the model (~340 MB) downloads from GitHub releases on first use |
| espeak-ng (pulled in by kokoro-onnx) | GPL-3.0 | runs in a separate process the user installs; sizzlr neither bundles nor links it |
| Geist, Geist Mono | SIL OFL 1.1 | bundled default fonts |
| mermaid | MIT | renders `diagram` scenes to SVG at build time |
| d3-scale, d3-shape | ISC | chart scales and paths |
| FFmpeg, Chrome | system | `hyperframes browser ensure` can fetch Chrome |

Network on first run: npm, PyPI, GitHub releases. Hugging Face is not needed.

## Milestones

1. **Scaffold.** TypeScript package, zod schemas for script and config, CLI skeleton, CI (lint,
   typecheck, schema tests). Reserve the npm name with a `0.0.1` placeholder.
2. **Port the engine.** Bring `prototype/build.mjs` over as typed modules (tts, timeline, animate,
   compose, scenes). Golden tests on timing; one 3-second render in CI.
3. **Polish the elements.** Each catalogue element as its own module with a preview in an
   `examples/catalogue` script; scenes as HyperFrames sub-compositions; portrait layouts for all.
   New: `diagram` (Mermaid), SVG charts, `custom` with its data attributes and network block.
   Outputs: subtitles, transcript, chapter markers, poster and GIF teaser.
4. **Skill and installers.** `skills/sizzlr/SKILL.md`, `sizzlr init` for Claude Code and Codex, the
   Claude Code plugin manifest, `npx skills add` support. Add a fact-check step to the skill: list
   every number in the script with the source line that supports it before building.
5. **Dogfood.** Five real PRs and two plans from different repos; tune the catalogue and the skill
   from what goes wrong.
6. **Publish 0.1.** README with a demo video, docs for config and elements, npm publish.
7. **Later.** Screen recordings of the running app as a scene (Playwright), word-level timings from
   a timestamped TTS model (karaoke captions), code morphing (diffreel or similar), GIF teaser plus
   MP4 for PR comments, distributed rendering (HyperFrames on Lambda or Cloud Run) for 10-minute
   videos, optional cloud voices behind a flag.

## Open questions

- Public on npm under `sizzlr`, or a scope?
- Default style: dialogue for everything, infomercial only on request?
- Should `sizzlr` fetch PRs itself (`sizzlr pr 123` via `gh`), or always leave reading to the agent?
- Where should videos land for PRs: a comment (needs hosting), an artifact, or just a file?
