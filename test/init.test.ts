import { existsSync } from "node:fs";
import { readFileSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseConfig } from "../src/config.ts";
import { init } from "../src/init.ts";
import { tempDir } from "./helpers.ts";

describe("init", () => {
  it("installs the skill for both agents and a valid config", async () => {
    const root = await tempDir();
    const { written } = await init({ root, global: false, force: false, skill: true, config: true });
    expect(written).toHaveLength(3);
    expect(existsSync(join(root, ".claude/skills/sizzlr/SKILL.md"))).toBe(true);
    expect(existsSync(join(root, ".agents/skills/sizzlr/SKILL.md"))).toBe(true);
    expect(() => parseConfig(JSON.parse(readFileSync(join(root, "sizzlr.config.json"), "utf8")))).not.toThrow();
  });

  it("keeps existing files unless forced", async () => {
    const root = await tempDir();
    await writeFile(join(root, "sizzlr.config.json"), "{}");
    const { skipped } = await init({ root, global: false, force: false, skill: false, config: true });
    expect(skipped).toEqual([join(root, "sizzlr.config.json")]);
    expect(await readFile(join(root, "sizzlr.config.json"), "utf8")).toBe("{}");
    await init({ root, global: false, force: true, skill: false, config: true });
    expect(await readFile(join(root, "sizzlr.config.json"), "utf8")).not.toBe("{}");
  });
});
