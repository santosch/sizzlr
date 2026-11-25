import type { Config } from "../config.ts";
import type { Motion } from "../motion.ts";
import type { Script, SceneOf, SceneType } from "../script.ts";
import type { Timed, TimedScene } from "../timeline.ts";
import { timeAt } from "../timeline.ts";
import { esc, markedWords, type MarkedWord } from "../text.ts";

export type SceneContext = {
  id: string;
  scene: TimedScene;
  script: Script;
  config: Config;
  motion: Motion;
  portrait: boolean;
  /** Time of line `at` (word `word`) of this scene. */
  at: (at?: number, word?: number) => number;
  /** Escaped text whose ==marks== get a marker stroke drawn shortly after `time`. */
  rich: (text: string, time?: number) => string;
  /** One word, with its marker stroke when it sits inside a ==mark==. */
  word: (word: MarkedWord, time?: number) => string;
  /** Copies a file (relative to the script) into the project: its path there and its source. */
  asset: (sourcePath: string) => Promise<{ path: string; source: string }>;
};

export type TimedSceneOf<T extends SceneType> = Timed<SceneOf<T>>;

export type SceneRenderer<T extends SceneType> = (ctx: SceneContext, scene: TimedSceneOf<T>) => string | Promise<string>;

/** Marks get unique ids across the whole video, so their strokes can be animated one by one. */
export const createMarks = (motion: Motion) => {
  let next = 0;
  const mark = (inner: string, time?: number) => {
    const id = `mk${next++}`;
    if (time !== undefined) motion.tween(`#${id} i`, { scaleX: 0 }, { scaleX: 1 }, time + 0.3, 0.45, "power3.out");
    return `<span class="mark" id="${id}">${inner}<i></i></span>`;
  };
  const rich = (text: string, time?: number) => esc(text).replace(/==(.+?)==/g, (_, inner: string) => mark(inner, time));
  const word = (w: MarkedWord, time?: number) => (w.marked ? mark(esc(w.w), time) : esc(w.w));
  return { rich, word };
};

export const sceneTime = (scene: TimedScene) => (at?: number, word?: number) => timeAt(scene, at, word);

/** Items that appear on the same line follow each other with this gap. */
export const STAGGER = 0.35;

/** When each item appears: on its line, and a little after the items before it on the same line. */
export const staggered = <T extends { at?: number | undefined }>(items: T[], ctx: SceneContext, gap = STAGGER, word?: (item: T) => number | undefined) => {
  const seen = new Map<number, number>();
  return items.map((item) => {
    const line = item.at ?? 0;
    const n = seen.get(line) ?? 0;
    seen.set(line, n + 1);
    const w = word?.(item);
    return w === undefined ? ctx.at(line) + n * gap : ctx.at(line, w);
  });
};

export { markedWords };
