import { describe, expect, it } from "vitest";
import { assignVoices, defaultVoices } from "../src/config.ts";
import { chapters, subtitles, transcript } from "../src/outputs.ts";
import { script, tempDir, timed } from "./helpers.ts";

const value = script([
  { type: "chapter", title: "Why" },
  { type: "punch", text: "Slow", lines: [{ who: "a", text: "Search is ==slow==." }] },
  { type: "chapter", title: "How" },
  { type: "title", title: "Cache", lines: [{ who: "b", text: "Cache it." }] },
]);

describe("outputs", async () => {
  const { scenes, total } = await timed(value, await tempDir());
  const cast = assignVoices(value.cast, defaultVoices);

  it("writes WebVTT with speakers and plain text", () => {
    const vtt = subtitles(scenes, cast);
    expect(vtt.startsWith("WEBVTT\n\n1\n")).toBe(true);
    expect(vtt).toContain("<v Ava>Search is slow.");
    expect(vtt).toMatch(/\d\d:\d\d:\d\d\.\d{3} --> \d\d:\d\d:\d\d\.\d{3}/);
  });

  it("derives chapters from chapter scenes", () => {
    const list = chapters(scenes, total);
    expect(list.map((c) => c.title)).toEqual(["Why", "How"]);
    expect(list[0]!.end).toBe(list[1]!.start);
    expect(list[1]!.end).toBe(total);
  });

  it("writes a transcript with headings", () => {
    const md = transcript({ title: value.title, source: "PR #1", scenes, cast, total });
    expect(md).toContain("# Test");
    expect(md).toContain("Source: PR #1");
    expect(md).toContain("## How (0:");
    expect(md).toContain("**Max** (0:");
  });
});
