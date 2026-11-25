import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assignVoices, defaultPalettes, parseConfig } from "../src/config.ts";

const voices = [
  { voice: "af_heart", speed: 1.2 },
  { voice: "bm_george", speed: 1.15 },
];

describe("assignVoices", () => {
  it("gives each member a different voice", () => {
    const cast = assignVoices({ a: { name: "A" }, b: { name: "B" } }, voices);
    expect(cast.a).toMatchObject({ voice: "af_heart", speed: 1.2 });
    expect(cast.b).toMatchObject({ voice: "bm_george", speed: 1.15 });
  });

  it("skips voices the cast already uses", () => {
    const cast = assignVoices({ a: { name: "A" }, b: { name: "B", voice: "af_heart" } }, voices);
    expect(cast.a?.voice).toBe("bm_george");
    expect(cast.b?.voice).toBe("af_heart");
  });

  it("keeps an explicit speed", () => {
    expect(assignVoices({ a: { name: "A", speed: 0.9 } }, voices).a?.speed).toBe(0.9);
  });
});

describe("parseConfig", () => {
  it("merges partial palettes over the defaults", () => {
    const config = parseConfig({ colors: { light: { accent: "#0070f3" } } });
    expect(config.colors.light).toEqual({ ...defaultPalettes.light, accent: "#0070f3" });
    expect(config.colors.dark).toEqual(defaultPalettes.dark);
  });

  it("resolves font files relative to the config", () => {
    const config = parseConfig({ font: { sans: { family: "Inter", file: "fonts/inter.woff2" }, mono: { family: "Mono", file: "/abs/mono.woff2" } } }, "/project/sizzlr.config.json");
    expect(config.font.sans.file).toBe(join("/project", "fonts/inter.woff2"));
    expect(config.font.mono.file).toBe("/abs/mono.woff2");
  });

  it("rejects unknown keys", () => {
    expect(() => parseConfig({ avatarBounce: true })).toThrow();
  });
});
