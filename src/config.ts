import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, resolve } from "node:path";
import { z } from "zod";
import type { CastMember, Script } from "./script.ts";

const require = createRequire(import.meta.url);

const fontFileSchema = z.object({ path: z.string(), weight: z.union([z.number(), z.string()]).default("100 900") }).strict();
const fontSchema = z
  .object({
    family: z.string(),
    file: z.string().optional().describe("One variable font file"),
    files: z.array(fontFileSchema).optional().describe("Several static files, one per weight"),
  })
  .strict()
  .refine((font) => font.file || font.files?.length, "A font needs `file` or `files`");

const paletteSchema = z
  .object({
    background: z.string(),
    surface: z.string(),
    ink: z.string(),
    muted: z.string(),
    line: z.string(),
    accent: z.string(),
    second: z.string(),
    good: z.string(),
    warn: z.string(),
    bad: z.string(),
    highlight: z.string(),
  })
  .strict();

export const configSchema = z
  .object({
    $schema: z.string().optional(),
    brand: z.object({ name: z.string() }).strict().default({ name: "sizzlr" }),
    font: z.object({ sans: fontSchema, mono: fontSchema }).strict().optional(),
    colors: z.object({ light: paletteSchema.partial(), dark: paletteSchema.partial() }).partial().default({}),
    voices: z.array(z.object({ voice: z.string(), speed: z.number().min(0.5).max(2).default(1.15) }).strict()).min(1).optional(),
    style: z
      .object({
        background: z.enum(["flat", "dots"]).default("flat"),
        soundEffects: z.boolean().default(true),
        disclaimer: z.enum(["outro", "corner", "none"]).default("outro"),
      })
      .strict()
      .default({ background: "flat", soundEffects: true, disclaimer: "outro" }),
    render: z
      .object({ quality: z.enum(["draft", "standard", "high"]).default("draft"), fps: z.number().int().min(12).max(60).default(30) })
      .strict()
      .default({ quality: "draft", fps: 30 }),
  })
  .strict();

export type Palette = z.infer<typeof paletteSchema>;
export type FontConfig = z.infer<typeof fontSchema>;

export const defaultPalettes = {
  light: {
    background: "#ffffff",
    surface: "#ffffff",
    ink: "#18181b",
    muted: "#6b7280",
    line: "#e5e7eb",
    accent: "#5b5bd6",
    second: "#3f3f46",
    good: "#2e8b6b",
    warn: "#c98a2b",
    bad: "#d4563f",
    highlight: "#fde68a",
  },
  dark: {
    background: "#16171d",
    surface: "#1f2129",
    ink: "#eceae4",
    muted: "#9a98a2",
    line: "#2e3039",
    accent: "#9a98f5",
    second: "#4b4d5a",
    good: "#5cc59b",
    warn: "#e8b04b",
    bad: "#f07a62",
    highlight: "rgba(154, 152, 245, 0.32)",
  },
} satisfies Record<"light" | "dark", Palette>;

export const defaultVoices = [
  { voice: "af_heart", speed: 1.2 },
  { voice: "bm_george", speed: 1.15 },
  { voice: "af_bella", speed: 1.2 },
  { voice: "am_michael", speed: 1.15 },
];

/** Geist and Geist Mono from the bundled `geist` package. */
const defaultFonts = (): { sans: FontConfig; mono: FontConfig } => {
  const root = dirname(require.resolve("geist/font"));
  return {
    sans: { family: "Geist", file: join(root, "fonts/geist-sans/Geist-Variable.woff2") },
    mono: { family: "Geist Mono", file: join(root, "fonts/geist-mono/GeistMono-Variable.woff2") },
  };
};

export type Config = {
  path: string | undefined;
  brand: { name: string };
  font: { sans: FontConfig; mono: FontConfig };
  colors: { light: Palette; dark: Palette };
  voices: { voice: string; speed: number }[];
  style: { background: "flat" | "dots"; soundEffects: boolean; disclaimer: "outro" | "corner" | "none" };
  render: { quality: "draft" | "standard" | "high"; fps: number };
};

export const CONFIG_FILE = "sizzlr.config.json";

/** The config file that applies to a script folder: its own, the nearest parent's, or none. */
export const findConfig = (fromDir: string) => {
  for (let dir = resolve(fromDir); ; dir = dirname(dir)) {
    const candidate = join(dir, CONFIG_FILE);
    if (existsSync(candidate)) return candidate;
    if (dirname(dir) === dir) return undefined;
  }
};

/** Font paths in a config are relative to the config file. */
const resolveFont = (font: FontConfig, base: string): FontConfig => ({
  ...font,
  file: font.file && (isAbsolute(font.file) ? font.file : resolve(base, font.file)),
  files: font.files?.map((f) => ({ ...f, path: isAbsolute(f.path) ? f.path : resolve(base, f.path) })),
});

export const parseConfig = (raw: unknown, path?: string): Config => {
  const parsed = configSchema.parse(raw);
  const base = path ? dirname(path) : process.cwd();
  return {
    path,
    brand: parsed.brand,
    font: parsed.font ? { sans: resolveFont(parsed.font.sans, base), mono: resolveFont(parsed.font.mono, base) } : defaultFonts(),
    colors: {
      light: { ...defaultPalettes.light, ...parsed.colors.light },
      dark: { ...defaultPalettes.dark, ...parsed.colors.dark },
    },
    voices: parsed.voices ?? defaultVoices,
    style: parsed.style,
    render: parsed.render,
  };
};

export const loadConfig = async ({ explicit, scriptDir }: { explicit?: string; scriptDir: string }) => {
  const path = explicit ? resolve(explicit) : findConfig(scriptDir);
  if (!path) return parseConfig({});
  return parseConfig(JSON.parse(await readFile(path, "utf8")), path);
};

/**
 * Gives every cast member a voice and speed. Members without a voice take the first configured
 * voice nobody in the cast uses yet, so two speakers never share a voice.
 */
export const assignVoices = (cast: Script["cast"], voices: Config["voices"]) => {
  const used = new Set(Object.values(cast).flatMap((member) => (member.voice ? [member.voice] : [])));
  return Object.fromEntries(
    Object.entries(cast).map(([id, member]): [string, CastMember & { voice: string; speed: number }] => {
      if (member.voice) return [id, { ...member, voice: member.voice, speed: member.speed ?? voices.find((v) => v.voice === member.voice)?.speed ?? 1.15 }];
      const next = voices.find((v) => !used.has(v.voice)) ?? voices[0] ?? defaultVoices[0]!;
      used.add(next.voice);
      return [id, { ...member, voice: next.voice, speed: member.speed ?? next.speed }];
    }),
  );
};
