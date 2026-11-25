import { existsSync } from "node:fs";
import { isAbsolute, resolve } from "node:path";
import { match } from "ts-pattern";
import { scriptSchema, type Scene, type Script } from "./script.ts";
import { plain, sum } from "./text.ts";

export type Finding = { level: "error" | "warning"; where: string; message: string };

/** Speech runs at about three words per second at the default speeds. */
const WORDS_PER_SECOND = 2.9;
const MAX_LINE_WORDS = 26;

const where = (i: number, scene: Scene) => `scenes[${i}] (${scene.type})`;

/** How many items a scene shows, and how many it comfortably holds. */
const crowding = (scene: Scene): [number, number] | undefined =>
  match(scene)
    .with({ type: "stats" }, (s): [number, number] => [s.items.length, 3])
    .with({ type: "decisions" }, (s): [number, number] => [s.items.length, 5])
    .with({ type: "chips" }, (s): [number, number] => [s.items.length, 7])
    .with({ type: "checks" }, (s): [number, number] => [s.items.length, 4])
    .with({ type: "todo" }, (s): [number, number] => [s.items.length, 6])
    .with({ type: "layers" }, (s): [number, number] => [s.items.length, 4])
    .with({ type: "chain" }, (s): [number, number] => [s.nodes.length, 6])
    .with({ type: "code" }, (s): [number, number] => [s.code.length, 8])
    .otherwise(() => undefined);

/** Line indexes (`at`) a scene refers to. */
const refs = (scene: Scene): number[] => {
  const ats: (number | undefined)[] = [];
  const collect = (value: unknown) => {
    if (Array.isArray(value)) value.forEach(collect);
    else if (value && typeof value === "object")
      for (const [key, inner] of Object.entries(value)) {
        if (key === "lines") continue;
        if ((key === "at" || key.endsWith("At")) && typeof inner === "number") ats.push(inner);
        else collect(inner);
      }
  };
  collect(scene);
  return ats.filter((n): n is number => n !== undefined);
};

const wordCount = (scene: Scene) => sum(scene.lines.map((l) => plain(l.say ?? l.text).split(/\s+/).length));

/** Rough length of the video, from word counts and chapter holds. */
export const estimateSeconds = (script: Script) => sum(script.scenes.map((s) => wordCount(s) / WORDS_PER_SECOND + (s.type === "chapter" ? s.hold : 0.3)));

/** Checks a script against the schema and the element catalogue's rules. */
export const lint = (raw: unknown, scriptDir: string): { script?: Script; findings: Finding[] } => {
  const parsed = scriptSchema.safeParse(raw);
  if (!parsed.success) {
    return { findings: parsed.error.issues.map((issue) => ({ level: "error", where: issue.path.join(".") || "script", message: issue.message })) };
  }
  const script = parsed.data;
  const findings: Finding[] = [];
  const add = (level: Finding["level"], at: string, message: string) => findings.push({ level, where: at, message });

  script.scenes.forEach((scene, i) => {
    scene.lines.forEach((line, li) => {
      if (!script.cast[line.who]) add("error", `${where(i, scene)}.lines[${li}]`, `"${line.who}" is not in the cast`);
      const words = plain(line.say ?? line.text).split(/\s+/).length;
      if (words > MAX_LINE_WORDS) add("warning", `${where(i, scene)}.lines[${li}]`, `${words} words; split lines over ${MAX_LINE_WORDS} words`);
    });
    for (const at of refs(scene)) if (at >= Math.max(1, scene.lines.length)) add("warning", where(i, scene), `refers to line ${at}, but the scene has ${scene.lines.length} line(s)`);
    if (scene.lines.length === 0 && scene.type !== "chapter") add("warning", where(i, scene), "has no lines; nothing is said while it is on screen");
    const crowd = crowding(scene);
    if (crowd && crowd[0] > crowd[1]) add("warning", where(i, scene), `${crowd[0]} items; keep it to ${crowd[1]} or split the scene`);

    match(scene)
      .with({ type: "chart" }, (s) => {
        if (s.unit && /^(px|pt|em|rem|%)$/.test(s.unit.trim())) add("warning", where(i, scene), `charts are for measured values (time, memory, size, cost), not "${s.unit}"`);
        const values = s.categories.flatMap((c) => c.values).length;
        if (values < 2 && !s.limit) add("warning", where(i, scene), `${values} value(s) is something to say, not to chart`);
        if (s.stack && s.kind !== "bar") add("error", where(i, scene), "`stack` only works with bar charts");
      })
      .with({ type: "shot" }, (s) => {
        const file = isAbsolute(s.image) ? s.image : resolve(scriptDir, s.image);
        if (!existsSync(file)) add("error", where(i, scene), `image not found: ${s.image}`);
      })
      .with({ type: "custom" }, (s) => {
        if (/(src|href)\s*=\s*["']?(https?:)?\/\//i.test(s.html) || /url\(\s*["']?(https?:)?\/\//i.test(s.css ?? "")) {
          add("error", where(i, scene), "custom scenes cannot load anything from the network; put files next to the script");
        }
      })
      .with({ type: "code" }, (s) => {
        if (s.code.every((c) => c.kind === "ctx")) add("warning", where(i, scene), "no added or removed lines; is this the change?");
      })
      .otherwise(() => undefined);

    if (i >= 2 && script.scenes[i - 1]!.type === scene.type && script.scenes[i - 2]!.type === scene.type && scene.type !== "chapter") {
      add("error", where(i, scene), `third ${scene.type} scene in a row; vary the elements`);
    } else if (i >= 1 && script.scenes[i - 1]!.type === scene.type && !["chapter", "chart"].includes(scene.type)) {
      add("warning", where(i, scene), `two ${scene.type} scenes in a row`);
    }
  });

  const seconds = estimateSeconds(script);
  const limit = script.maxSeconds ?? (script.format === "portrait" ? 60 : 120);
  if (seconds > limit) add("warning", "script", `about ${Math.round(seconds)} s, over the ${limit} s target; cut lines or set maxSeconds`);
  const hasChapters = script.scenes.some((s) => s.type === "chapter");
  if (seconds > 150 && !hasChapters) add("warning", "script", "videos over two and a half minutes read better with chapter scenes");
  return { script, findings };
};
