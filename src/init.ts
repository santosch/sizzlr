import { existsSync } from "node:fs";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { packageRoot } from "./compose.ts";
import { CONFIG_FILE, defaultPalettes, defaultVoices } from "./config.ts";

/** Where each agent looks for skills, per project and per user. */
export const skillFolders = (root: string, global: boolean) =>
  global
    ? { claude: join(homedir(), ".claude/skills/sizzlr"), codex: join(homedir(), ".agents/skills/sizzlr") }
    : { claude: join(root, ".claude/skills/sizzlr"), codex: join(root, ".agents/skills/sizzlr") };

export const starterConfig = {
  $schema: "https://raw.githubusercontent.com/santosch/sizzlr/main/schema/config.schema.json",
  brand: { name: "My project" },
  colors: { light: defaultPalettes.light, dark: defaultPalettes.dark },
  voices: defaultVoices.slice(0, 2),
  style: { background: "flat", soundEffects: true, disclaimer: "outro" },
  render: { quality: "draft", fps: 30 },
};

/** Installs the skill for Claude Code and Codex and writes a starter config. */
export const init = async ({ root, global, force, skill, config }: { root: string; global: boolean; force: boolean; skill: boolean; config: boolean }) => {
  const written: string[] = [];
  const skipped: string[] = [];
  if (skill) {
    for (const dir of Object.values(skillFolders(root, global))) {
      const target = join(dir, "SKILL.md");
      if (existsSync(target) && !force) {
        skipped.push(target);
        continue;
      }
      await mkdir(dir, { recursive: true });
      await copyFile(join(packageRoot, "skills/sizzlr/SKILL.md"), target);
      written.push(target);
    }
  }
  if (config) {
    const target = join(root, CONFIG_FILE);
    if (existsSync(target) && !force) skipped.push(target);
    else {
      await writeFile(target, JSON.stringify(starterConfig, null, 2) + "\n");
      written.push(target);
    }
  }
  return { written, skipped };
};
