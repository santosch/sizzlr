import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { scriptSchema, sceneTypes } from "../src/script.ts";

describe("script schema", () => {
  it("accepts the examples", async () => {
    for (const name of ["sizzlr-intro", "tour"]) {
      const raw = JSON.parse(await readFile(new URL(`../examples/${name}/script.json`, import.meta.url), "utf8"));
      expect(() => scriptSchema.parse(raw)).not.toThrow();
    }
  });

  it("fills in defaults", () => {
    const parsed = scriptSchema.parse({ title: "T", cast: { a: { name: "A" } }, scenes: [{ type: "chapter", title: "One" }] });
    expect(parsed).toMatchObject({ version: 1, theme: "light", format: "landscape" });
    expect(parsed.scenes[0]).toMatchObject({ hold: 1.4, lines: [] });
  });

  it("rejects unknown keys and scene types", () => {
    expect(scriptSchema.safeParse({ title: "T", cast: { a: { name: "A" } }, scenes: [{ type: "title", title: "x", colour: "red" }] }).success).toBe(false);
    expect(scriptSchema.safeParse({ title: "T", cast: { a: { name: "A" } }, scenes: [{ type: "slideshow" }] }).success).toBe(false);
  });

  it("needs a cast", () => {
    expect(scriptSchema.safeParse({ title: "T", cast: {}, scenes: [{ type: "chapter", title: "x" }] }).success).toBe(false);
  });

  it("lists every scene type", () => {
    expect(sceneTypes).toContain("diagram");
    expect(sceneTypes).toContain("custom");
    expect(sceneTypes).toHaveLength(18);
  });
});
