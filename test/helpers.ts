import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { scriptSchema, type Script } from "../src/script.ts";
import { layout } from "../src/timeline.ts";
import { encodeWav, type Speech } from "../src/tts.ts";

export const tempDir = () => mkdtemp(join(tmpdir(), "sizzlr-test-"));

export const script = (scenes: unknown[], extra: Record<string, unknown> = {}): Script =>
  scriptSchema.parse({
    title: "Test",
    cast: { a: { name: "Ava", role: "Author" }, b: { name: "Max", role: "Reviewer" } },
    scenes,
    ...extra,
  });

/** One second of speech for every line, with 0.1 s of silence before and after. */
export const fakeSpeech = async (value: Script, dir: string): Promise<Speech[][]> => {
  const samples = new Float32Array(24000).map((_, i) => (i > 2400 && i < 21600 ? Math.sin(i / 8) * 0.3 : 0));
  const file = join(dir, "line.wav");
  await writeFile(file, encodeWav(samples));
  return value.scenes.map((s) => s.lines.map(() => ({ file, duration: 1, lead: 0.1, speechEnd: 0.9 })));
};

export const timed = async (value: Script, dir: string) => layout(value.scenes, await fakeSpeech(value, dir));
