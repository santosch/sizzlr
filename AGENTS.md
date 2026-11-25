# sizzlr

sizzlr turns plans and pull requests into short narrated review videos: two voices, animated
scenes, real code and real numbers, rendered locally with no API keys. It ships as an npm package
(engine + CLI) with a thin agent skill on top, for Claude Code and Codex alike.

Read `PLAN.md` first: it is the design, the decisions and the milestones.

## Status

- Milestones 1-4 of `PLAN.md` are done: the package, engine, every catalogue element (including
  `diagram` and `custom`), outputs, CLI, skill, installers, CI, README and examples.
- Next: milestone 5 (dogfood on real PRs and plans) and publishing 0.1 to npm.

## Layout

- `src/cli.ts` is the entry point; `src/build.ts` runs speech, timeline, compose and render.
- `src/script.ts` and `src/config.ts` hold the zod schemas; `schema/` is generated from them with
  `node src/cli.ts schema --out schema` (CI fails when it is stale).
- `src/scenes/` has one renderer per element, registered in `src/scenes/registry.ts`.
- `runtime/player.js` runs inside the page: animations, counters, Mermaid, custom scenes.
- `styles/` is the page CSS (tokens only, no literal colours); `skills/sizzlr/SKILL.md` is the
  agent skill that `sizzlr init` installs.

## Decisions that are settled (don't reopen without being asked)

- **Look:** white or near-white background with neutral, cool greys. No warm or off-white "paper"
  tones. Flat: no moving backgrounds, no camera drift, no badges in the corners. The AI-generated
  note is one small line in the outro.
- **Speakers:** the speaking person is shown in full, the other dimmed. **No avatar motion of any
  kind (no bouncing with the voice), not even behind a config switch.**
- **Two speakers never share a voice.** Cast members without a voice take the first configured voice
  nobody in the cast uses yet.
- **Pacing:** fast. Silence trimmed from every clip, ~0.06 s between lines, voices at 1.15–1.2×.
- **Elements:** a closed catalogue with "use when / never for" rules (see `PLAN.md`); a chart is for
  measured values with a real gap, never for config values or font sizes. `custom` exists for the
  agent's own HTML when nothing fits or the user asks for something specific.
- **Company-agnostic:** nothing in the package refers to any company. Brand lives in
  `sizzlr.config.json` (fonts, colours, voices, style switches).
- **No animation library.** Native Web Animations from animation data; counters drawn from
  HyperFrames' `hf-seek` event. No GSAP (its licence restricts no-code animation tools).
- **Draft render quality is the default**; it is good enough.
- **Licence:** sizzlr is MIT. The voice pipeline's eSpeak NG (GPL-3.0, inside `phonemizer`) is
  disclosed in the README, not avoided. FFmpeg and Chrome are system tools, never bundled.
- **Accuracy:** every fact, number, name and code line on screen comes from the source. UI
  illustrations say they are illustrations.

## Code style

TypeScript, ESM, Node 22+.

- Arrow functions. Types over interfaces. Use `satisfies` where it fits.
- Avoid type casts except in type guards.
- No classes unless explicitly asked.
- No nested ternaries; use `ts-pattern`'s `match` instead.
- Early returns over big `if` blocks. A braceless one-line `if` only for an early return.
- Define a function's parameter type inline unless it is reused.
- No barrel files or re-exports.
- Don't try/catch at low levels; let errors propagate. No silent fallbacks.
- Concise code; generics over duplication.
- Comments only when they add real value. They describe the code as it is now, never its history
  ("added", "now", "used to"). JSDoc on module-level declarations, `//` inside functions. No emoji.

## Working habits

- Run the CLI from source with `node src/cli.ts …` (Node 24 strips the types).
- Before rendering, look at a contact sheet (`node src/cli.ts snapshot examples/tour`): nothing
  overlapping or cut off, every scene showing its element while it is talked about. Then render.
- `npm run check` runs typecheck, lint and tests.
- Share videos and snapshots with the user as soon as they exist; don't batch them up.
- Measure instead of guessing: render times, lengths, costs.
- Rendering is frame-by-frame seeking in headless Chrome, so cost per frame is what matters.
  Avoid CSS `filter: blur()` and anything that repaints the whole frame every frame; a blurred
  background roughly doubled render time in the prototype.
- Example scripts and tests use neutral content, never anything from a company codebase.

## Environment

- Always run HyperFrames with `DO_NOT_TRACK=1` (it sends usage telemetry by default).
- Node's built-in `fetch` ignores `HTTPS_PROXY`; the CLI installs undici's `EnvHttpProxyAgent`
  when a proxy is set, so the model download works behind one.
- `onnxruntime-node` tries to download CUDA binaries on Linux x64 during install; the repo's
  `.npmrc` skips that (`ONNXRUNTIME_NODE_INSTALL_CUDA=skip` does the same elsewhere).
- Voice model downloads come from Hugging Face: `huggingface.co`, `*.hf.co`,
  `cdn-lfs.huggingface.co` must be reachable.
- Chrome and FFmpeg are expected on the system; `npx hyperframes doctor` checks both.

## Git

- Commit author for this repo: Sebastian Antosch `<write@sebastian-antosch.de>`. Set it with
  `git config user.email write@sebastian-antosch.de` in a fresh clone.
- Commit messages: a short imperative subject, a body that says why.
