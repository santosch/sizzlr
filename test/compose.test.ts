import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { compose } from "../src/compose.ts";
import { assignVoices, parseConfig } from "../src/config.ts";
import { sceneTypes } from "../src/script.ts";
import { script, tempDir, timed } from "./helpers.ts";

const say = [{ who: "a", text: "One two three four." }];

/** One scene of every type except `shot`, which needs an image. */
const everything = [
  { type: "title", title: "T", lines: say },
  { type: "punch", text: "Hey ==you==", lines: say },
  { type: "big", value: 42, countFrom: 0, suffix: " ms", lines: say },
  { type: "chart", heading: "Bars", unit: "ms", categories: [{ label: "a", values: [1] }, { label: "b", values: [3] }], lines: say },
  { type: "chart", kind: "line", heading: "Line", series: [{ name: "x" }], categories: [{ label: "a", values: [1] }, { label: "b", values: [3] }], lines: say },
  { type: "compare", heading: "C", panels: [{ label: "Before", blocks: [{ kind: "text", text: "x" }], verdicts: [{ text: "bad", tone: "bad", at: 0 }] }], lines: say },
  { type: "stats", heading: "S", items: [{ value: "1", label: "x" }], lines: say },
  { type: "chips", heading: "C", items: [{ label: "x" }], lines: say },
  { type: "code", heading: "C", file: "a.ts", code: [{ kind: "add", text: "const a = 1;" }], lines: say },
  { type: "checks", heading: "C", items: [{ value: "1", label: "x", sticker: "hm" }], lines: say },
  { type: "decisions", heading: "D", items: [{ topic: "a", after: "b" }], lines: say },
  { type: "todo", heading: "T", items: [{ label: "x" }], lines: say },
  { type: "chain", heading: "C", nodes: [{ label: "a" }, { label: "b" }], lines: say },
  { type: "layers", heading: "L", items: [{ title: "a", who: "b" }, { title: "c", who: "d" }], lines: say },
  { type: "chapter", title: "Ch" },
  { type: "diagram", mermaid: "flowchart LR\n  A[One] --> B[Two]", lines: say },
  { type: "custom", html: '<p data-at="0">hi</p>', css: "p { color: var(--accent); }", render: "root.dataset.t = t;", lines: say },
  { type: "outro", title: "Bye", stamp: "Done", lines: say },
];

describe("compose", () => {
  it("writes a project with every scene type", async () => {
    const dir = await tempDir();
    const value = script(everything);
    const { scenes, total } = await timed(value, dir);
    const config = parseConfig({});
    const out = join(dir, "project");
    const stats = await compose({ script: value, config, cast: assignVoices(value.cast, config.voices), scenes, total, scriptDir: dir, out });

    const html = await readFile(join(out, "index.html"), "utf8");
    expect(html).toContain('data-composition-id');
    expect(html.match(/class="clip scene/g)).toHaveLength(everything.length);
    expect(html).toContain("Content-Security-Policy");
    expect(html).toMatch(/#s16 \{\s*p \{ color: var\(--accent\); \}/);
    expect(html).toContain("window.__SIZZLR_RENDER__");
    expect(existsSync(join(out, "assets/mermaid.min.js"))).toBe(true);
    expect(existsSync(join(out, "assets/player.js"))).toBe(true);
    expect(new Set(stats.sceneTypes)).toEqual(new Set(sceneTypes.filter((t) => t !== "shot")));
    expect(stats.animations).toBeGreaterThan(50);
  });
});
