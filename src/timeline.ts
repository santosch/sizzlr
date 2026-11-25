import type { Line, Scene } from "./script.ts";
import type { Speech } from "./tts.ts";
import { plain, round3, sum } from "./text.ts";

export type Word = { w: string; at: number };
export type TimedLine = Line & Speech & { start: number; words: Word[] };
/** A scene placed in time: each variant keeps its own fields, with timed lines instead of plain ones. */
export type Timed<S> = S extends unknown ? Omit<S, "lines"> & { start: number; end: number; lines: TimedLine[] } : never;
export type TimedScene = Timed<Scene>;

const LEAD_IN = 0.3;
const GAP = 0.06;
const SCENE_TAIL = 0.12;
const OUTRO_TAIL = 1.2;

/**
 * When each word is spoken, estimated from the clip's speech span: longer words and words
 * before punctuation take more of it.
 */
export const wordTimes = (text: string, start: number, lead: number, speechEnd: number): Word[] => {
  const words = plain(text).split(/\s+/).filter(Boolean);
  const weights = words.map((w) => w.length + 1.5 + (/[.,!?:;]$/.test(w) ? 3 : 0));
  const total = sum(weights);
  const span = speechEnd - lead;
  let acc = 0;
  return words.map((w, i) => {
    const at = round3(start + lead + (acc / total) * span);
    acc += weights[i]!;
    return { w, at };
  });
};

/**
 * Lays the scenes out in time. Speech drives everything: a scene lasts as long as its lines,
 * silence inside clips is cut, and scenes without lines hold for `hold` seconds.
 */
export const layout = (scenes: Scene[], speech: Speech[][]): { scenes: TimedScene[]; total: number } => {
  let t = LEAD_IN;
  const timed = scenes.map((scene, si): TimedScene => {
    const start = si === 0 ? 0 : t;
    const clips = speech[si] ?? [];
    if (scene.lines.length === 0) t += "hold" in scene && typeof scene.hold === "number" ? scene.hold : 1.6;
    const lines = scene.lines.map((line, li): TimedLine => {
      const clip = clips[li]!;
      const lineStart = round3(t - clip.lead + 0.02);
      t = lineStart + clip.speechEnd + (line.pauseAfter ?? GAP);
      return { ...line, ...clip, start: lineStart, words: wordTimes(line.text, lineStart, clip.lead, clip.speechEnd) };
    });
    t += SCENE_TAIL + (scene.type === "outro" ? OUTRO_TAIL : 0);
    return { ...scene, lines, start: round3(start), end: round3(t) } as TimedScene;
  });
  return { scenes: timed, total: round3(t) };
};

/** The time an item tied to line `at` (and optionally word `word`) appears. */
export const timeAt = (scene: TimedScene, at = 0, word?: number) => {
  const line = scene.lines[Math.min(at, scene.lines.length - 1)];
  if (!line) return scene.start + 0.2;
  if (word === undefined) return line.words[0]?.at ?? line.start;
  return line.words[Math.min(word, line.words.length - 1)]?.at ?? line.start;
};
