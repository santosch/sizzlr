import { describe, expect, it } from "vitest";
import { layout, timeAt, wordTimes } from "../src/timeline.ts";
import { script } from "./helpers.ts";

const speech = (n: number) => Array.from({ length: n }, () => ({ file: "x.wav", duration: 2, lead: 0.2, speechEnd: 1.7 }));

describe("wordTimes", () => {
  it("spreads words over the speech span, in order", () => {
    const words = wordTimes("Nobody reads the ==whole plan.==", 10, 0.2, 1.7);
    expect(words.map((w) => w.w)).toEqual(["Nobody", "reads", "the", "whole", "plan."]);
    expect(words[0]?.at).toBe(10.2);
    for (let i = 1; i < words.length; i++) expect(words[i]!.at).toBeGreaterThan(words[i - 1]!.at);
    expect(words.at(-1)!.at).toBeLessThan(11.7);
  });
});

describe("layout", () => {
  it("cuts leading silence and chains lines with a short gap", () => {
    const value = script([{ type: "title", title: "T", lines: [{ who: "a", text: "one two" }, { who: "b", text: "three" }] }]);
    const { scenes, total } = layout(value.scenes, [speech(2)]);
    const [first, second] = scenes[0]!.lines;
    expect(first!.start + first!.lead).toBeCloseTo(0.32, 2);
    expect(second!.start + second!.lead).toBeCloseTo(first!.start + first!.speechEnd + 0.06 + 0.02, 2);
    expect(total).toBeGreaterThan(second!.start + second!.speechEnd);
  });

  it("holds lineless scenes and honours pauseAfter", () => {
    const value = script([
      { type: "chapter", title: "One", hold: 2 },
      { type: "title", title: "T", lines: [{ who: "a", text: "x", pauseAfter: 1 }] },
    ]);
    const { scenes } = layout(value.scenes, [[], speech(1)]);
    expect(scenes[1]!.start).toBeCloseTo(0.3 + 2 + 0.12, 3);
    expect(scenes[1]!.end - (scenes[1]!.lines[0]!.start + 1.7)).toBeCloseTo(1.12, 2);
  });

  it("finds the time of a line and word", () => {
    const value = script([{ type: "title", title: "T", lines: [{ who: "a", text: "alpha beta gamma" }] }]);
    const scene = layout(value.scenes, [speech(1)]).scenes[0]!;
    expect(timeAt(scene, 0)).toBe(scene.lines[0]!.words[0]!.at);
    expect(timeAt(scene, 0, 2)).toBe(scene.lines[0]!.words[2]!.at);
    expect(timeAt(scene, 5, 9)).toBe(scene.lines[0]!.words[2]!.at);
  });
});
