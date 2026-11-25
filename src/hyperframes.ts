import { execFile } from "node:child_process";
import { readdir } from "node:fs/promises";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);
const require = createRequire(import.meta.url);

/** HyperFrames sends usage telemetry unless told not to; sizzlr always tells it not to. */
const env = { ...process.env, DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1" };

const bin = () => join(dirname(require.resolve("hyperframes/package.json")), "bin/hyperframes.mjs");

const hyperframes = (args: string[]) => run(process.execPath, [bin(), ...args], { env, maxBuffer: 64 * 1024 * 1024 });

/** Renders the project to an MP4. */
export const renderVideo = async ({ project, output, quality, fps }: { project: string; output: string; quality: string; fps: number }) => {
  await hyperframes(["render", project, "-o", output, "-q", quality, "-f", String(fps)]);
};

/** Stills of the project at the given times, plus contact sheets that tile them. */
export const snapshot = async ({ project, output, at }: { project: string; output: string; at: number[] }) => {
  await hyperframes(["snapshot", project, "--at", at.join(","), "-o", output, "--no-end"]);
  // Long videos get several sheets: contact-sheet-1.jpg, contact-sheet-2.jpg, ...
  return (await readdir(output)).filter((f) => /^contact-sheet(-\d+)?\.jpg$/.test(f)).toSorted().map((f) => join(output, f));
};

/** HyperFrames' own environment check, as JSON when it offers it. */
export const doctorReport = async () => {
  const { stdout } = await hyperframes(["doctor"]).catch((error: { stdout?: string }) => ({ stdout: error.stdout ?? "" }));
  return stdout;
};
