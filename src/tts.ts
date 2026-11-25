import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { round3 } from "./text.ts";

export const MODEL_ID = "onnx-community/Kokoro-82M-v1.0-ONNX";
const MODEL_DTYPE = "q8";
const SAMPLE_RATE = 24000;

/** Where models and generated speech are cached; `SIZZLR_CACHE` overrides it. */
export const cacheRoot = () => process.env.SIZZLR_CACHE ?? join(process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"), "sizzlr");

export type Speech = { file: string; duration: number; lead: number; speechEnd: number };

type Kokoro = {
  generate: (text: string, options: { voice: string; speed: number }) => Promise<{ audio: Float32Array; sampling_rate: number }>;
  voices: Record<string, { name: string; language: string; gender: string; overallGrade: string }>;
};

let modelPromise: Promise<Kokoro> | undefined;

/** Loads the Kokoro model once per process; the first call downloads it (~90 MB) into the cache. */
export const loadModel = () => {
  modelPromise ??= (async () => {
    const transformers = await import("@huggingface/transformers");
    transformers.env.cacheDir = join(cacheRoot(), "models");
    const { KokoroTTS } = await import("kokoro-js");
    // The voice table and `generate` are all sizzlr uses; kokoro-js types them as a wider class.
    return (await KokoroTTS.from_pretrained(MODEL_ID, { dtype: MODEL_DTYPE, device: "cpu" })) as unknown as Kokoro;
  })();
  return modelPromise;
};

/** Voice ids with their language and quality grade, from the model's own table. */
export const listVoices = async () => {
  const { voices } = await loadModel();
  return Object.entries(voices).map(([id, v]) => ({ id, name: v.name, language: v.language, gender: v.gender, grade: v.overallGrade }));
};

/** 16-bit mono PCM WAV. */
export const encodeWav = (samples: Float32Array, rate = SAMPLE_RATE) => {
  const data = Buffer.alloc(samples.length * 2);
  samples.forEach((s, i) => data.writeInt16LE(Math.round(Math.max(-1, Math.min(1, s)) * 32767), i * 2));
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + data.length, 4);
  header.write("WAVEfmt ", 8);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36);
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
};

/**
 * Where speech starts and ends inside a clip: the first and last 10 ms window louder than
 * about -42 dB. Lets the timeline cut the model's leading and trailing silence.
 */
export const speechBounds = (samples: Float32Array, rate = SAMPLE_RATE) => {
  const win = Math.round(rate / 100);
  const threshold = 0.008;
  const loud: number[] = [];
  for (let i = 0; i < samples.length; i += win) {
    let sum = 0;
    const end = Math.min(samples.length, i + win);
    for (let j = i; j < end; j++) sum += samples[j]! * samples[j]!;
    if (Math.sqrt(sum / (end - i)) > threshold) loud.push(i);
  }
  const duration = samples.length / rate;
  if (loud.length === 0) return { lead: 0, speechEnd: duration };
  return { lead: round3(loud[0]! / rate), speechEnd: round3(Math.min(duration, (loud.at(-1)! + win) / rate)) };
};

/** Speech for one line, from the cache when the same voice, speed and text were spoken before. */
export const synthesize = async ({ text, voice, speed }: { text: string; voice: string; speed: number }): Promise<Speech> => {
  const dir = join(cacheRoot(), "speech");
  const key = createHash("sha1").update(`${MODEL_ID}|${MODEL_DTYPE}|${voice}|${speed}|${text}`).digest("hex").slice(0, 20);
  const file = join(dir, `${key}.wav`);
  const meta = join(dir, `${key}.json`);
  if (existsSync(file) && existsSync(meta)) return { file, ...(JSON.parse(await readFile(meta, "utf8")) as Omit<Speech, "file">) };
  const model = await loadModel();
  if (!model.voices[voice]) throw new Error(`Unknown voice "${voice}". Run \`sizzlr voices\` to list them.`);
  const { audio, sampling_rate } = await model.generate(text, { voice, speed });
  const info = { duration: round3(audio.length / sampling_rate), ...speechBounds(audio, sampling_rate) };
  await mkdir(dir, { recursive: true });
  await writeFile(file, encodeWav(audio, sampling_rate));
  await writeFile(meta, JSON.stringify(info));
  return { file, ...info };
};
