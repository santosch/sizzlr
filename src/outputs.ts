import { execFile } from "node:child_process";
import { rename, rm, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import type { CastMember } from "./script.ts";
import type { TimedScene } from "./timeline.ts";
import { plain } from "./text.ts";

const run = promisify(execFile);

const stamp = (seconds: number, separator = ".") => {
  const ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}${separator}${String(ms % 1000).padStart(3, "0")}`;
};

const short = (seconds: number) => `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

/** WebVTT subtitles, one cue per spoken line, labelled with the speaker. */
export const subtitles = (scenes: TimedScene[], cast: Record<string, CastMember>) =>
  [
    "WEBVTT",
    ...scenes
      .flatMap((s) => s.lines)
      .map((line, i) => `${i + 1}\n${stamp(line.start + line.lead)} --> ${stamp(line.start + line.speechEnd)}\n<v ${cast[line.who]?.name ?? line.who}>${plain(line.text)}`),
  ].join("\n\n") + "\n";

/** The chapters: chapter scenes when there are any, otherwise none. */
export const chapters = (scenes: TimedScene[], total: number) =>
  scenes.flatMap((s, i) => {
    if (s.type !== "chapter") return [];
    const next = scenes.slice(i + 1).find((x) => x.type === "chapter");
    return [{ title: plain(s.title), start: s.start, end: next?.start ?? total }];
  });

/** A readable, searchable transcript with chapter headings and timestamps. */
export const transcript = ({ title, source, scenes, cast, total }: { title: string; source?: string; scenes: TimedScene[]; cast: Record<string, CastMember>; total: number }) => {
  const parts = [`# ${plain(title)}`, `${source ? `Source: ${source} · ` : ""}${short(total)} min`];
  for (const scene of scenes) {
    if (scene.type === "chapter") parts.push(`## ${plain(scene.title)} (${short(scene.start)})`);
    for (const line of scene.lines) parts.push(`**${cast[line.who]?.name ?? line.who}** (${short(line.start)}): ${plain(line.text)}`);
  }
  return parts.join("\n\n") + "\n";
};

/** Writes chapter markers into the MP4, so players can jump between chapters. */
export const addChapters = async (video: string, list: { title: string; start: number; end: number }[]) => {
  if (list.length === 0) return;
  const meta = `${video}.chapters.txt`;
  const tmp = `${video}.tmp.mp4`;
  const body = list.map((c) => `[CHAPTER]\nTIMEBASE=1/1000\nSTART=${Math.round(c.start * 1000)}\nEND=${Math.round(c.end * 1000)}\ntitle=${c.title.replace(/[=;#\\\n]/g, " ")}`).join("\n");
  await writeFile(meta, `;FFMETADATA1\n${body}\n`);
  await run("ffmpeg", ["-v", "error", "-y", "-i", video, "-i", meta, "-map_metadata", "1", "-map_chapters", "1", "-codec", "copy", tmp]);
  await rename(tmp, video);
  await rm(meta);
};

/** A still frame for link previews and players that show a poster. */
export const poster = async (video: string, output: string, at: number) => {
  await run("ffmpeg", ["-v", "error", "-y", "-ss", String(at), "-i", video, "-frames:v", "1", output]);
};

/** A short, small GIF teaser for places that do not play video, such as PR comments. */
export const teaser = async (video: string, output: string, seconds: number) => {
  const filter = "fps=12,scale=720:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=128[p];[b][p]paletteuse=dither=bayer:bayer_scale=4";
  await run("ffmpeg", ["-v", "error", "-y", "-t", String(seconds), "-i", video, "-filter_complex", filter, "-loop", "0", output]);
};
