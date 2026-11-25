import { round3 } from "./text.ts";

export type Frame = { opacity?: number; x?: number; y?: number; scale?: number; scaleX?: number; scaleY?: number; rotation?: number };

export type Ease = "none" | "power1.inOut" | "power2.out" | "power2.in" | "power2.inOut" | "power3.out" | "power4.out" | "power4.in" | "back.out" | "sine.inOut";

export type Tween = {
  sel: string;
  from?: Frame;
  to?: Frame;
  keyframes?: Record<string, string | number>[];
  start: number;
  dur: number;
  ease: Ease;
  repeat?: number;
  yoyo?: boolean;
  stagger?: number;
  fill?: "none" | "forwards" | "both";
};

export type Counter = { sel: string; from: number; to: number; start: number; dur: number; ease: "power2.out" | "power2.inOut" };

export type SoundName = "whoosh" | "pop" | "thud" | "ding";
export type Cue = { name: SoundName; time: number; volume: number };

/** Elements whose reveal gets a pop, and those that land with a thud. */
const POP = /\.(chip|stat|tile|dec|todo|node|layer|pw|hl|panel)-\d+$/;
const THUD = /\.(sticker|cnote|stamp|verdict-\d+)$/;

/**
 * Collects every animation, counter and sound of a video as data. The page runtime turns the
 * data into native Web Animations; nothing here knows about the browser.
 */
export const createMotion = ({ soundEffects }: { soundEffects: boolean }) => {
  const tweens: Tween[] = [];
  const counters: Counter[] = [];
  const cues: Cue[] = [];

  const sfx = (name: SoundName, time: number, volume = 0.5) => {
    if (!soundEffects) return;
    if (name === "pop" && cues.some((c) => c.name === "pop" && Math.abs(c.time - time) < 0.14)) return;
    cues.push({ name, time: round3(Math.max(0, time)), volume });
  };

  const tween = (sel: string, from: Frame | undefined, to: Frame, start: number, dur: number, ease: Ease = "power3.out", extra: Partial<Tween> = {}) => {
    tweens.push({ sel, ...(from ? { from } : {}), to, start: round3(start), dur, ease, ...extra });
  };

  const keys = (sel: string, keyframes: Tween["keyframes"], start: number, dur: number, ease: Ease = "none", extra: Partial<Tween> = {}) => {
    tweens.push({ sel, keyframes, start: round3(start), dur, ease, ...extra });
  };

  /** Fades and moves an element into its resting place. */
  const reveal = (sel: string, time: number, { rotationTo = 0, ...from }: Frame & { rotationTo?: number } = { opacity: 0, y: 28 }, ease: Ease = "power3.out", dur = 0.45) => {
    if (POP.test(sel)) sfx("pop", time, 0.32);
    if (THUD.test(sel)) sfx("thud", time + dur * 0.8, 0.7);
    tween(sel, from, { opacity: 1, x: 0, y: 0, scale: 1, rotation: rotationTo }, time, dur, ease);
  };

  const count = (sel: string, from: number, to: number, start: number, dur: number, ease: Counter["ease"] = "power2.out") => {
    counters.push({ sel, from, to, start: round3(start), dur, ease });
  };

  return { tweens, counters, cues, tween, keys, reveal, count, sfx };
};

export type Motion = ReturnType<typeof createMotion>;
