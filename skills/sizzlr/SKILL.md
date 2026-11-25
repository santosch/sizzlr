---
name: sizzlr
description: Turn a plan, pull request or design doc into a short narrated review video (MP4) with two local voices, animated scenes, real code and real numbers. Use when someone says "make a video of this PR", "sizzlr this", "explainer video for this plan", "video walkthrough", or wants a summary people will actually watch. Runs fully locally with no API keys.
---

# sizzlr

You write a `script.json`: what is said, who says it, and which element is on screen while they
say it. The `sizzlr` CLI turns it into voices, scenes and an MP4. Your job is the script.

Run the CLI with `npx -y sizzlr@0 <command>` (or `sizzlr <command>` when it is installed).

## 1. Read the source, pick what matters

Read the whole plan, or the whole PR: description, diff, review comments, test output. For a PR,
fetch it yourself (`gh pr view`, `gh pr diff`, the GitHub tools you have, or the local branch).

Pick what a reviewer or teammate must take away: the problem, the change, the decisions worth a
second look, the evidence, what is still open.

**Every fact, number, name and code line on screen or in speech comes from the source.** No
rounding that changes meaning, no invented benchmarks, file names, UI labels or quotes. Code on
screen is copied from the diff. A UI illustration only shows what the source describes.

## 2. Length and format

| Style | Cast | Length | Good for |
| --- | --- | --- | --- |
| Dialogue | reviewer + author | 30-90 s per PR | PRs, rule and design changes |
| Infomercial (`"theme": "dark"`) | host + sceptic | 45-75 s | measurable wins: speed, size, cost, crashes |
| Walkthrough | reviewer + author | 2-10 min, in chapters | plans, specs, big features |
| Short (`"format": "portrait"`) | one narrator | 30-60 s | chat apps, phones |

Long is fine when the content needs it; set `maxSeconds`. Over two minutes, use 3-8 `chapter`
scenes and end with what is open or next.

## 3. The element catalogue

Pick by purpose. Each element has a job and things it is never used for. When nothing fits, use
fewer elements, or `custom`; never a wrong one.

| `type` | Use when | Never for |
| --- | --- | --- |
| `punch` | the first 3-5 s: the problem or the claim in under 8 words | a summary |
| `title` | a calm start: what this is, in one line | |
| `big` | one striking measured number (`countFrom` counts up to it) | counts nobody cares about |
| `shot` | a real screenshot exists: zoom into 1-3 regions with `focus` | invented screens |
| `compare` | before/after of a layout or copy change, as a UI illustration with a verdict per panel | a real screen you could screenshot instead |
| `code` | the 2-8 lines of the diff that are the change | whole files, boilerplate |
| `chain` | an order of steps, an escalation, a call chain | lists without an order |
| `diagram` | a structure with branches: flowchart, sequence, state machine, entities (Mermaid) | a straight line of steps (`chain`) |
| `layers` | levels that build on each other: tiers, permissions, fallbacks | unrelated items |
| `chart` | measured values with a real gap: time, memory, size, cost, counts over time (`kind`: `bar`, `line`, `area`); `limit` for a threshold | config values, font sizes, pixel values, one number |
| `stats` | 2-3 headline numbers | more than 3 |
| `checks` | what was verified: tests, errors, gaps; a `sticker` for the one awkward truth | |
| `decisions` | 2-5 "check this" choices: topic, decision, why | trivia |
| `chips` | what is included, 3-7 short labels | |
| `todo` | what is next, later or still open | |
| `chapter` | each chapter of a video over two minutes | short videos |
| `outro` | the last line; the stamp lands on the last word | |
| `custom` | nothing above fits, or the user asks for something specific | anything above does the job |

Two scenes of the same type in a row is a smell; three is an error.

### `diagram`

`mermaid` holds Mermaid source. Nodes appear as their label is spoken, edges draw in after them.
Keep it to 4-9 nodes with short labels; `flowchart LR` fits a landscape video, `flowchart TD` a
portrait one.

### `custom`

`html` is your own markup for the scene, `css` is scoped to it, and both can use the theme's
tokens: `var(--ink)`, `--muted`, `--line`, `--surface`, `--accent`, `--good`, `--warn`, `--bad`,
`--sans`, `--mono`. Animate with attributes, not scripts:

- `data-at="1"` appears on line 1 of the scene, `data-word="4"` on its fifth word.
- `data-anim`: `fade`, `slide` (default), `pop`, or `draw` (SVG strokes with `pathLength="1"`).

For motion that attributes can't express, `render` is the body of a function `(t, root)` called
on every frame with the scene's time in seconds; set styles from `t`, never from the clock. Nothing
may load from the network; put images next to the script and reference them relatively.

## 4. Write the lines

- Spoken English, short sentences, one idea per line, 6-22 words (lint warns over 26).
- Numbers as they are spoken in `say` when the digits read badly: `"text": "p95 is 1,840 ms"`,
  `"say": "p ninety-five is eighteen hundred forty milliseconds"`. Also acronyms and names:
  `"say": "Sizzler"`.
- Humour comes from the second voice: the reviewer doubts, the author answers. One running joke
  beats five. Mock the code, the warning count, the size; never a person.
- `"punch": true` zooms and shakes the scene on the line's first word. 1-3 per video.
- `pauseAfter` (seconds) adds a beat after a punchline; 0.2-0.4 is plenty.
- Speech runs about three words per second.

## 5. Make it land on the words

Each scene holds the lines spoken while it is on screen. `at` on an item is the index of the
scene's line on which it appears; `word` also picks the word in that line (0-based). Put each item
on the word that introduces it. Mark the one phrase per heading that matters with `==double
equals==`; it gets a marker stroke.

## 6. Cast

```json
"cast": {
  "rev": { "name": "Max", "role": "Reviewer" },
  "auth": { "name": "Ava", "role": "Author" }
}
```

Leave `voice` out unless asked: the project's `sizzlr.config.json` picks voices, and two speakers
never share one. `sizzlr voices` lists the voices.

## 7. Check the facts, then build, look and render

1. Fact check: list every number, name and code line in the script next to the line of the source
   it comes from. Fix or drop anything without a source.
2. `sizzlr lint <dir>`: fix every error, read every warning.
3. `sizzlr snapshot <dir>`: builds the project and writes a contact sheet with one still per scene.
   Look at it: nothing overlapping or cut off, every scene showing its element.
4. `sizzlr render <dir>`: writes `<name>.mp4`, `.vtt` subtitles, `.transcript.md`, a `.png`
   poster and a `.gif` teaser next to the script.

Rendering takes roughly two to three times the video's length. Hand over the MP4 with two lines on
what it covers and what it leaves out. Don't commit the outputs or the `<name>.sizzlr/` folder
unless asked.

## Script skeleton

```json
{
  "$schema": "https://raw.githubusercontent.com/santosch/sizzlr/main/schema/script.schema.json",
  "version": 1,
  "title": "What this video is about",
  "source": "PR #123",
  "cast": { "rev": { "name": "Max", "role": "Reviewer" }, "auth": { "name": "Ava", "role": "Author" } },
  "scenes": [
    { "type": "punch", "text": "The ==claim==, short.", "lines": [{ "who": "rev", "text": "..." }] },
    { "type": "outro", "title": "Where to read more", "lines": [{ "who": "auth", "text": "..." }] }
  ]
}
```

`sizzlr schema` prints the full JSON schema with every field. Examples:
https://github.com/santosch/sizzlr/tree/main/examples
