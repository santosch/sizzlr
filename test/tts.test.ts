import { describe, expect, it } from "vitest";
import { encodeWav, speechBounds } from "../src/tts.ts";

describe("encodeWav", () => {
  it("writes a 16-bit mono PCM header", () => {
    const wav = encodeWav(new Float32Array([0, 0.5, -0.5, 1.5]), 24000);
    expect(wav.toString("ascii", 0, 4)).toBe("RIFF");
    expect(wav.toString("ascii", 8, 12)).toBe("WAVE");
    expect(wav.readUInt16LE(22)).toBe(1);
    expect(wav.readUInt32LE(24)).toBe(24000);
    expect(wav.readUInt16LE(34)).toBe(16);
    expect(wav.readUInt32LE(40)).toBe(8);
    expect(wav.readInt16LE(50)).toBe(32767);
  });
});

describe("speechBounds", () => {
  it("finds where the sound starts and ends", () => {
    const samples = new Float32Array(24000).map((_, i) => (i >= 4800 && i < 19200 ? Math.sin(i / 5) * 0.2 : 0.0005));
    const { lead, speechEnd } = speechBounds(samples, 24000);
    expect(lead).toBeCloseTo(0.2, 2);
    expect(speechEnd).toBeCloseTo(0.8, 2);
  });

  it("keeps the whole clip when it is silent", () => {
    expect(speechBounds(new Float32Array(2400), 24000)).toEqual({ lead: 0, speechEnd: 0.1 });
  });
});
