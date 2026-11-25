import { describe, expect, it } from "vitest";
import { lint } from "../src/lint.ts";

const base = (scenes: unknown[], extra: Record<string, unknown> = {}) => ({ title: "T", cast: { a: { name: "A" } }, scenes, ...extra });
const say = (text = "A short line.") => [{ who: "a", text }];
const messages = (raw: unknown) => lint(raw, process.cwd()).findings.map((f) => `${f.level}: ${f.message}`);

describe("lint", () => {
  it("passes a clean script", () => {
    expect(messages(base([{ type: "punch", text: "Hi", lines: say() }, { type: "outro", title: "Bye", lines: say() }]))).toEqual([]);
  });

  it("reports schema errors", () => {
    expect(messages(base([{ type: "punch" }]))[0]).toMatch(/^error/);
  });

  it("catches speakers outside the cast", () => {
    expect(messages(base([{ type: "punch", text: "Hi", lines: [{ who: "zed", text: "Hello." }] }]))).toContain('error: "zed" is not in the cast');
  });

  it("warns on long lines and late references", () => {
    const long = Array.from({ length: 30 }, () => "word").join(" ");
    const found = messages(base([{ type: "chips", heading: "H", items: [{ label: "x", at: 3 }], lines: say(long) }]));
    expect(found.some((m) => m.includes("30 words"))).toBe(true);
    expect(found.some((m) => m.includes("refers to line 3"))).toBe(true);
  });

  it("flags charts of style values and single numbers", () => {
    const chart = { type: "chart", heading: "Font", unit: "px", categories: [{ label: "Body", values: [16] }], lines: say() };
    const found = messages(base([chart]));
    expect(found.some((m) => m.includes('not "px"'))).toBe(true);
    expect(found.some((m) => m.includes("1 value(s)"))).toBe(true);
  });

  it("errors on three scenes of one type in a row", () => {
    const chip = { type: "chips", heading: "H", items: [{ label: "x" }], lines: say() };
    const found = messages(base([chip, chip, chip]));
    expect(found).toContain("warning: two chips scenes in a row");
    expect(found).toContain("error: third chips scene in a row; vary the elements");
  });

  it("blocks network access from custom scenes", () => {
    const found = messages(base([{ type: "custom", html: '<img src="https://example.com/a.png">', lines: say() }]));
    expect(found[0]).toMatch(/^error: custom scenes cannot load/);
  });

  it("reports missing screenshots", () => {
    expect(messages(base([{ type: "shot", image: "missing.png", lines: say() }]))).toContain("error: image not found: missing.png");
  });

  it("warns when the script runs long", () => {
    const line = Array.from({ length: 20 }, () => "word").join(" ");
    const scenes = Array.from({ length: 12 }, (_, i) => ({ type: i % 2 ? "punch" : "title", ...(i % 2 ? { text: "x" } : { title: "x" }), lines: [say(line)[0], say(line)[0]] }));
    expect(messages(base(scenes, { maxSeconds: 60 })).some((m) => m.includes("over the 60 s target"))).toBe(true);
  });
});
