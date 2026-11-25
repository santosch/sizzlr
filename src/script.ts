import { z } from "zod";

/** Colour roles an element can use; they map to the theme's tokens. */
export const toneSchema = z.enum(["plain", "good", "warn", "bad", "accent", "hatch"]);

const at = z.number().int().min(0).optional().describe("Index of the scene's line on which this appears");
const word = z.number().int().min(0).optional().describe("Word within that line on which this appears");

export const lineSchema = z
  .object({
    who: z.string().min(1).describe("Cast id of the speaker"),
    text: z.string().min(1).describe("Caption text; ==marks== are allowed and not spoken"),
    say: z.string().min(1).optional().describe("Spoken form when it differs from the caption, e.g. acronyms"),
    pauseAfter: z.number().min(0).max(3).optional().describe("Extra pause after the line, in seconds"),
    punch: z.boolean().optional().describe("Zoom and shake the scene on the line's first word"),
  })
  .strict();

const lines = z.array(lineSchema).default([]);
const heading = z.string().min(1);

const titleScene = z.object({ type: z.literal("title"), kicker: z.string().optional(), title: heading, subtitle: z.string().optional(), lines }).strict();

const punchScene = z
  .object({
    type: z.literal("punch"),
    text: heading,
    tone: toneSchema.optional(),
    line: z.number().int().min(0).optional().describe("Line whose words the punch text lands on"),
    sub: z.string().optional(),
    subAt: at,
    lines,
  })
  .strict();

const bigScene = z
  .object({
    type: z.literal("big"),
    kicker: z.string().optional(),
    value: z.union([z.number(), z.string()]),
    countFrom: z.number().optional(),
    countDuration: z.number().positive().optional(),
    prefix: z.string().optional(),
    suffix: z.string().optional(),
    tone: toneSchema.optional(),
    label: z.string().optional(),
    footnote: z.string().optional(),
    at,
    footnoteAt: at,
    lines,
  })
  .strict();

const chartScene = z
  .object({
    type: z.literal("chart"),
    heading,
    kind: z.enum(["bar", "line", "area"]).default("bar"),
    unit: z.string().optional(),
    max: z.number().positive().optional(),
    stack: z.boolean().optional().describe("Stack a category's values (bars only)"),
    series: z.array(z.object({ name: z.string(), tone: toneSchema.optional() }).strict()).optional(),
    categories: z
      .array(
        z
          .object({
            label: z.string(),
            values: z.array(z.number()).min(1),
            labels: z.array(z.string()).optional().describe("Display text per value, e.g. '3,062 ms'"),
            tones: z.array(toneSchema).optional(),
            at,
          })
          .strict(),
      )
      .min(1),
    limit: z.object({ value: z.number(), label: z.string(), at }).strict().optional(),
    note: z.object({ text: z.string(), at }).strict().optional(),
    stagger: z.number().min(0).optional(),
    lines,
  })
  .strict();

const shotScene = z
  .object({
    type: z.literal("shot"),
    image: z.string().min(1).describe("Path to a PNG or JPEG, relative to the script"),
    url: z.string().optional().describe("Text in the browser frame's address bar"),
    heading: z.string().optional(),
    focus: z
      .array(
        z
          .object({
            at,
            word,
            x: z.number().min(0).max(1),
            y: z.number().min(0).max(1),
            w: z.number().gt(0).max(1),
            h: z.number().gt(0).max(1),
            label: z.string().optional(),
            tone: toneSchema.optional(),
            zoom: z.number().min(1).max(4).optional(),
          })
          .strict(),
      )
      .default([]),
    zoomOutAt: at,
    lines,
  })
  .strict();

const blockSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("page"), text: z.string(), size: z.number().positive(), annot: z.string().optional() }).strict(),
  z.object({ kind: z.literal("card"), text: z.string(), size: z.number().positive(), annot: z.string().optional(), custom: z.boolean().optional(), lines: z.number().int().min(0).max(6).optional() }).strict(),
  z.object({ kind: z.literal("text"), text: z.string() }).strict(),
  z.object({ kind: z.literal("button"), text: z.string(), primary: z.boolean().optional() }).strict(),
]);

const compareScene = z
  .object({
    type: z.literal("compare"),
    heading,
    panels: z
      .array(
        z
          .object({
            label: z.string(),
            at,
            blocks: z.array(blockSchema).min(1),
            verdicts: z.array(z.object({ text: z.string(), tone: toneSchema, at: z.number().int().min(0) }).strict()).optional(),
          })
          .strict(),
      )
      .min(1)
      .max(3),
    lines,
  })
  .strict();

const statsScene = z.object({ type: z.literal("stats"), heading, items: z.array(z.object({ value: z.string(), label: z.string(), tone: toneSchema.optional(), at }).strict()).min(1), lines }).strict();

const chipsScene = z.object({ type: z.literal("chips"), heading, items: z.array(z.object({ label: z.string(), at, word }).strict()).min(1), lines }).strict();

const codeScene = z
  .object({
    type: z.literal("code"),
    heading,
    file: z.string(),
    code: z.array(z.object({ kind: z.enum(["add", "del", "ctx"]).default("ctx"), text: z.string(), at }).strict()).min(1),
    callouts: z.array(z.object({ text: z.string(), at }).strict()).optional(),
    lines,
  })
  .strict();

const checksScene = z
  .object({
    type: z.literal("checks"),
    heading,
    items: z.array(z.object({ value: z.string(), label: z.string(), tone: toneSchema.optional(), at, sticker: z.string().optional(), stickerAt: at }).strict()).min(1),
    lines,
  })
  .strict();

const decisionsScene = z
  .object({ type: z.literal("decisions"), heading, items: z.array(z.object({ topic: z.string(), after: z.string(), why: z.string().optional(), at }).strict()).min(1), lines })
  .strict();

const todoScene = z.object({ type: z.literal("todo"), heading, items: z.array(z.object({ label: z.string(), tag: z.string().optional(), at }).strict()).min(1), lines }).strict();

const chainScene = z
  .object({
    type: z.literal("chain"),
    heading,
    nodes: z.array(z.object({ label: z.string(), kicker: z.string().optional(), note: z.string().optional(), tone: toneSchema.optional(), at }).strict()).min(2),
    caption: z.string().optional(),
    captionAt: at,
    lines,
  })
  .strict();

const layersScene = z
  .object({
    type: z.literal("layers"),
    heading,
    items: z.array(z.object({ title: z.string(), who: z.string(), badge: z.string().optional(), at }).strict()).min(2),
    caption: z.string().optional(),
    captionAt: at,
    lines,
  })
  .strict();

const chapterScene = z.object({ type: z.literal("chapter"), title: heading, hold: z.number().positive().default(1.4), lines }).strict();

const outroScene = z.object({ type: z.literal("outro"), title: heading, subtitle: z.string().optional(), stamp: z.string().optional(), lines }).strict();

const diagramScene = z
  .object({
    type: z.literal("diagram"),
    heading: z.string().optional(),
    mermaid: z.string().min(1).describe("Mermaid source: flowchart, sequenceDiagram, stateDiagram-v2, erDiagram, ..."),
    lines,
  })
  .strict();

const customScene = z
  .object({
    type: z.literal("custom"),
    html: z.string().min(1).describe("Scene markup; elements with data-at / data-word / data-anim appear as they are spoken"),
    css: z.string().optional().describe("Scoped to this scene; may use the theme tokens such as var(--accent)"),
    render: z.string().optional().describe("Body of a function (t, root) called with the scene time on every frame"),
    lines,
  })
  .strict();

export const sceneSchema = z.discriminatedUnion("type", [
  titleScene,
  punchScene,
  bigScene,
  chartScene,
  shotScene,
  compareScene,
  statsScene,
  chipsScene,
  codeScene,
  checksScene,
  decisionsScene,
  todoScene,
  chainScene,
  layersScene,
  chapterScene,
  outroScene,
  diagramScene,
  customScene,
]);

export const castMemberSchema = z
  .object({
    name: z.string().min(1),
    role: z.string().optional(),
    voice: z.string().optional().describe("Kokoro voice id; defaults come from the config"),
    speed: z.number().min(0.5).max(2).optional(),
  })
  .strict();

export const scriptSchema = z
  .object({
    $schema: z.string().optional(),
    version: z.literal(1).default(1),
    title: z.string().min(1),
    source: z.string().optional().describe("What the video is about, e.g. 'PR #123' or 'docs/plan.md'"),
    theme: z.enum(["light", "dark"]).default("light"),
    format: z.enum(["landscape", "portrait"]).default("landscape"),
    maxSeconds: z.number().positive().optional(),
    cast: z.record(z.string(), castMemberSchema).refine((cast) => Object.keys(cast).length > 0, "The cast needs at least one member"),
    scenes: z.array(sceneSchema).min(1),
  })
  .strict();

export type Tone = z.infer<typeof toneSchema>;
export type Line = z.infer<typeof lineSchema>;
export type Scene = z.infer<typeof sceneSchema>;
export type SceneOf<T extends Scene["type"]> = Extract<Scene, { type: T }>;
export type CastMember = z.infer<typeof castMemberSchema>;
export type Script = z.infer<typeof scriptSchema>;
export type SceneType = Scene["type"];

export const sceneTypes = sceneSchema.options.map((option) => option.shape.type.value);
