#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { parseArgs } from "node:util";
import { setGlobalDispatcher, EnvHttpProxyAgent } from "undici";
import { z } from "zod";
import { build, render, scriptPath } from "./build.ts";
import { packageRoot } from "./compose.ts";
import { configSchema } from "./config.ts";
import { doctorReport, snapshot } from "./hyperframes.ts";
import { init } from "./init.ts";
import { lint } from "./lint.ts";
import { scriptSchema } from "./script.ts";
import { cacheRoot, listVoices, loadModel } from "./tts.ts";

const HELP = `sizzlr: plans and pull requests as two-voice review videos

Usage
  sizzlr init [--global] [--force] [--no-skill] [--no-config]
                                 install the agent skill and write sizzlr.config.json
  sizzlr lint <script>           check a script before building it
  sizzlr build <script>          speak the lines and write the HyperFrames project
  sizzlr snapshot <script> [--at 1,4,9]
                                 build, then save stills as a contact sheet
  sizzlr render <script> [--quality draft|standard|high] [--no-extras]
                                 build and render the MP4, subtitles, transcript,
                                 poster and GIF teaser next to the script
  sizzlr voices                  list the available voices
  sizzlr schema [--out <dir>]    print or write the JSON schemas
  sizzlr doctor                  check FFmpeg, Chrome and the voice model

<script> is a script.json, or a folder holding one.
Options: --config <file> picks a config instead of the nearest sizzlr.config.json.`;

/** Node's fetch ignores HTTPS_PROXY on its own; the voice model download goes through it. */
if (process.env.HTTPS_PROXY ?? process.env.https_proxy) setGlobalDispatcher(new EnvHttpProxyAgent());

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    config: { type: "string" },
    at: { type: "string" },
    quality: { type: "string" },
    out: { type: "string" },
    global: { type: "boolean", default: false },
    force: { type: "boolean", default: false },
    "no-skill": { type: "boolean", default: false },
    "no-config": { type: "boolean", default: false },
    "no-extras": { type: "boolean", default: false },
    help: { type: "boolean", short: "h", default: false },
    version: { type: "boolean", short: "v", default: false },
  },
});

const [command, target] = positionals;
const show = (file: string) => relative(process.cwd(), file) || ".";

const progress = (done: number, total: number) => {
  if (!process.stderr.isTTY) return;
  process.stderr.write(`\r  speaking ${done}/${total}`);
  if (done === total) process.stderr.write("\n");
};

const needTarget = () => {
  if (target) return target;
  console.error(`sizzlr ${command}: which script? Pass a script.json or a folder holding one.`);
  process.exit(2);
};

const runLint = async (file: string) => {
  const { findings } = lint(JSON.parse(await readFile(file, "utf8")), dirname(file));
  for (const f of findings) console.log(`${f.level === "error" ? "error  " : "warning"} ${f.where}: ${f.message}`);
  const errors = findings.filter((f) => f.level === "error").length;
  console.log(findings.length === 0 ? "No findings." : `${errors} error(s), ${findings.length - errors} warning(s)`);
  return errors;
};

const runBuild = async () => {
  const file = scriptPath(needTarget());
  if (!existsSync(file)) throw new Error(`No script at ${show(file)}`);
  if ((await runLint(file)) > 0) process.exit(1);
  const started = Date.now();
  const built = await build({ target: file, configPath: values.config, onProgress: progress });
  console.log(`Built ${show(built.out)}: ${built.scenes.length} scenes, ${built.total.toFixed(1)} s, in ${((Date.now() - started) / 1000).toFixed(0)} s`);
  return built;
};

const schemas = () => ({
  "script.schema.json": z.toJSONSchema(scriptSchema, { io: "input" }),
  "config.schema.json": z.toJSONSchema(configSchema, { io: "input" }),
});

const commands: Record<string, () => Promise<void>> = {
  init: async () => {
    const { written, skipped } = await init({ root: process.cwd(), global: values.global, force: values.force, skill: !values["no-skill"], config: !values["no-config"] });
    for (const file of written) console.log(`wrote   ${show(file)}`);
    for (const file of skipped) console.log(`exists  ${show(file)} (--force overwrites)`);
    console.log("\nAsk your agent: \"Make a sizzlr video of this PR.\"");
  },
  lint: async () => {
    const errors = await runLint(scriptPath(needTarget()));
    if (errors > 0) process.exit(1);
  },
  build: async () => {
    await runBuild();
  },
  snapshot: async () => {
    const built = await runBuild();
    const at = values.at ? values.at.split(",").map(Number) : built.scenes.map((s) => Number(Math.max(s.start + 0.3, s.end - 0.4).toFixed(2)));
    const sheets = await snapshot({ project: built.out, output: join(built.out, "snapshots"), at });
    for (const sheet of sheets) console.log(`Contact sheet: ${show(sheet)}`);
  },
  render: async () => {
    const built = await runBuild();
    const started = Date.now();
    const files = await render(built, { quality: values.quality, extras: !values["no-extras"] });
    console.log(`Rendered in ${((Date.now() - started) / 1000).toFixed(0)} s:`);
    for (const file of files) console.log(`  ${show(file)}`);
  },
  voices: async () => {
    for (const voice of await listVoices()) console.log(`${voice.id.padEnd(12)} ${voice.name.padEnd(10)} ${voice.language.padEnd(6)} ${voice.gender.padEnd(7)} grade ${voice.grade}`);
  },
  schema: async () => {
    const all = schemas();
    if (!values.out) {
      console.log(JSON.stringify(all["script.schema.json"], null, 2));
      return;
    }
    await mkdir(values.out, { recursive: true });
    for (const [name, schema] of Object.entries(all)) await writeFile(join(values.out, name), JSON.stringify(schema, null, 2) + "\n");
    console.log(`Wrote ${Object.keys(all).join(", ")} to ${show(values.out)}`);
  },
  doctor: async () => {
    console.log(`node     ${process.version}`);
    console.log(`cache    ${cacheRoot()}`);
    console.log(await doctorReport());
    process.stdout.write("voices   loading model… ");
    const started = Date.now();
    await loadModel();
    console.log(`ok (${((Date.now() - started) / 1000).toFixed(1)} s)`);
  },
};

const main = async () => {
  if (values.version) {
    const pkg = z.object({ version: z.string() }).parse(JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")));
    console.log(pkg.version);
    return;
  }
  const run = command ? commands[command] : undefined;
  if (values.help || !run) {
    console.log(HELP);
    if (command && !run && !values.help) process.exit(2);
    return;
  }
  await run();
};

await main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
