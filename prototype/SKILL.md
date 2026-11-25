---
name: sizzlr
description: Turn a plan, PR or design doc into a narrated explainer video (MP4) with two local voices, animated on-brand scenes and sound. Use when someone says "make an explainer video", "video for this PR", "turn this plan into a video", "infomercial for this", or wants a summary people will actually watch. Runs fully locally: no API keys.
---

# sizzlr

You write a `script.json`; the builder turns it into audio, scenes, sound and an MP4. Your job is
the script: what to say, who says it, and which element is on screen while they say it.

## 1. Read the source, pick what matters

Read the whole plan or PR (description and diff). Pick what a reviewer or teammate must take away:
the problem, the change, the decisions worth a second look, the evidence, what is still open.

**Every fact, number and name on screen or in speech comes from the source.** No rounding that
changes meaning, no invented benchmarks, file names or UI labels. Code on screen is copied from
the diff. A UI illustration only shows what the source describes, and says it is an illustration.

## 2. Length and format

| Style | `theme` | Cast | Length | Good for |
| --- | --- | --- | --- | --- |
| Dialogue | `light` | reviewer + author | 30-90 s per PR | PRs, rule and design changes |
| Infomercial | `dark` | host + sceptic | 45-75 s | measurable wins: perf, size, cost, crash fixes |
| Plan walkthrough | `light` | reviewer + author | 2-10 min, in chapters | plans, specs, big features |
| Short | `light`, `"format": "portrait"` | one narrator | 30-60 s | Slack, phones |

Long is fine when the content needs it; set `maxSeconds`. Over 2 minutes, use `chapter` scenes
(4-8 of them) and end with what is open or next.

## 3. The element catalogue

Pick by purpose. Each element has a job and things it must never be used for. When nothing fits,
use fewer elements, not a wrong one.

| Purpose | `type` | Use when | Never for |
| --- | --- | --- | --- |
| Hook | `punch` | the first 3-5 s: the problem or the claim in under 8 words | a summary |
| Hook | `title` | a calm start: what this is, in one line | — |
| Hook / evidence | `big` | one striking measured number (`countFrom` animates it) | counts nobody cares about |
| Show the product | `shot` | a real screenshot exists (PR, repo, test run): zoom into 1-3 regions | invented screens |
| Show the product | `compare` | rules about how UI looks, before/after of a layout or copy change: a UI **illustration** built from the theme, side by side, with a verdict stamp per panel | a real screen that you could screenshot instead |
| Explain a change | `code` | the 2-6 lines of the diff that are the change | whole files, boilerplate |
| Explain a flow | `chain` | an order of steps, an escalation, a call chain, slices that build on each other | lists without an order |
| Explain structure | `layers` | levels that build on each other: privacy, permissions, caching tiers | unrelated items |
| Evidence | `chart` | measured values with a real gap: time, memory, size, cost, counts over time; a limit line when something crosses a threshold | config values, font sizes, two numbers you can just say |
| Evidence | `stats` | 2-3 headline numbers | more than 3 |
| Evidence | `checks` | what was verified: tests, errors, gaps; a `sticker` for the one awkward truth | — |
| Decisions | `decisions` | 3-5 "check this" choices: topic, decision, why | trivia |
| Scope | `chips` | what is included, 3-7 short labels | — |
| Structure | `chapter` | each chapter of a video over 2 minutes | short videos |
| Structure | `todo` | what is next, later or still open | — |
| Ending | `outro` | where to read more; the stamp lands on the last word | — |

Two scenes in a row of the same type is a smell; three is a bug.

## 4. Write the lines

- Spoken English, short sentences, one idea per line, 6-22 words. Numbers written as spoken
  ("forty-one milliseconds"); the screen shows digits.
- `say` when the spoken form differs from the caption, e.g. `"text": "GAEB", "say": "G A E B"`.
- Humour comes from the second voice: the reviewer or sceptic doubts, the author answers. One
  running joke beats five. Mock the code, the warning count, the size, never a person.
- `"punch": true` on a line zooms and shakes the scene on its first word. Use it 1-3 times.
- `pauseAfter` (seconds) adds a beat after a punchline; 0.2-0.4 is plenty.
- Speech runs about 3 words per second at speed 1.15-1.2.

## 5. Make it land on the words

Each scene holds the lines spoken while it is on screen. `at` on an item is the line index (within
the scene) when it appears; `word` additionally picks the word in that line. Put each item on the
word that introduces it. A `punch` scene's words land as they are spoken.

Mark the one phrase per heading that matters with `==double equals==`; it gets a marker stroke.

## 6. Cast

Local Kokoro voices. Pairs that work: `af_heart` + `bm_george` (dialogue), `af_bella` +
`am_michael` (infomercial). Main speaker at speed 1.2, second at 1.15. `tone`: `blue` for the main
speaker, `dark` for the second.

## 7. Build, look, render

```bash
sizzlr build <dir>                   # audio, timing, project; warns when over the length target
sizzlr snapshot <dir> --at 2,10,20   # stills; look before rendering
sizzlr render <dir>                  # draft quality MP4 next to script.json
```

Look at the snapshots: nothing overlapping, nothing cut off, every scene shows its element while it
is being talked about, no element used against the catalogue. Then hand over the MP4 with two lines
on what it covers and what it leaves out.

## Examples

`examples/sizzlr-intro/script.json`: a short dialogue using title, punch, chain, chart, decisions
and outro.
