import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { assignVoices, loadConfig, type Config } from "./config.ts";
import { compose } from "./compose.ts";
import { addChapters, chapters, poster, subtitles, teaser, transcript } from "./outputs.ts";
import { renderVideo } from "./hyperframes.ts";
import { scriptSchema, type Script } from "./script.ts";
import { plain, sum } from "./text.ts";
import { layout } from "./timeline.ts";
import { synthesize, type Speech } from "./tts.ts";

/** A script file, or a folder holding `script.json`. */
export const scriptPath = (target: string) => (target.endsWith(".json") ? resolve(target) : resolve(target, "script.json"));

export const readScript = async (file: string): Promise<Script> => scriptSchema.parse(JSON.parse(await readFile(file, "utf8")));

export type BuildResult = Awaited<ReturnType<typeof build>>;

/**
 * Speaks every line, lays the scenes out in time and writes the HyperFrames project next to
 * the script (`<name>.sizzlr/`). Nothing is rendered yet.
 */
export const build = async ({ target, configPath, onProgress }: { target: string; configPath?: string; onProgress?: (done: number, total: number) => void }) => {
  const file = scriptPath(target);
  const scriptDir = dirname(file);
  const script = await readScript(file);
  const config: Config = await loadConfig({ explicit: configPath, scriptDir });
  const cast = assignVoices(script.cast, config.voices);

  const unknown = script.scenes.flatMap((s) => s.lines.filter((l) => !cast[l.who]).map((l) => l.who));
  if (unknown.length > 0) throw new Error(`Lines spoken by someone not in the cast: ${[...new Set(unknown)].join(", ")}`);

  const total = sum(script.scenes.map((s) => s.lines.length));
  let done = 0;
  const speech: Speech[][] = [];
  for (const scene of script.scenes) {
    const clips: Speech[] = [];
    for (const line of scene.lines) {
      const member = cast[line.who]!;
      clips.push(await synthesize({ text: line.say ?? plain(line.text), voice: member.voice, speed: member.speed }));
      onProgress?.(++done, total);
    }
    speech.push(clips);
  }

  const timed = layout(script.scenes, speech);
  const name = basename(file, ".json") === "script" ? basename(scriptDir) : basename(file, ".json");
  const out = join(scriptDir, `${name}.sizzlr`);
  await mkdir(out, { recursive: true });
  const stats = await compose({ script, config, cast, scenes: timed.scenes, total: timed.total, scriptDir, out });
  await writeFile(join(out, "timings.json"), JSON.stringify({ total: timed.total, scenes: timed.scenes.map(({ type, start, end }) => ({ type, start, end })) }, null, 2));
  return { file, scriptDir, name, out, script, config, cast, scenes: timed.scenes, total: timed.total, ...stats };
};

/** Renders a built project, then writes subtitles, transcript, chapters, poster and teaser next to it. */
export const render = async (built: BuildResult, { quality, extras = true }: { quality?: string; extras?: boolean } = {}) => {
  const base = join(built.scriptDir, built.name);
  const video = `${base}.mp4`;
  await renderVideo({ project: built.out, output: video, quality: quality ?? built.config.render.quality, fps: built.config.render.fps });
  const files = [video];
  if (!extras) return files;
  const list = chapters(built.scenes, built.total);
  await addChapters(video, list);
  await writeFile(`${base}.vtt`, subtitles(built.scenes, built.cast));
  await writeFile(`${base}.transcript.md`, transcript({ title: built.script.title, source: built.script.source, scenes: built.scenes, cast: built.cast, total: built.total }));
  const posterAt = Math.min(built.total - 0.5, (built.scenes[0]?.end ?? 3) - 0.6);
  await poster(video, `${base}.png`, Math.max(0.5, posterAt));
  await teaser(video, `${base}.gif`, Math.min(10, built.total));
  return [...files, `${base}.vtt`, `${base}.transcript.md`, `${base}.png`, `${base}.gif`];
};
