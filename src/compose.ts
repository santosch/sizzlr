import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { basename, dirname, extname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { Config, FontConfig } from "./config.ts";
import { createMotion } from "./motion.ts";
import { createMarks, sceneTime, type SceneContext } from "./scenes/context.ts";
import { renderers } from "./scenes/registry.ts";
import type { CastMember, Script, SceneType } from "./script.ts";
import { esc, round3 } from "./text.ts";
import type { TimedScene } from "./timeline.ts";

const require = createRequire(import.meta.url);

/** The package root, from both `src/` (tests) and `dist/` (published). */
export const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

export const SIZE = { landscape: { width: 1920, height: 1080 }, portrait: { width: 1080, height: 1920 } };

const FONT_FORMAT: Record<string, string> = { ".woff2": "woff2", ".woff": "woff", ".ttf": "truetype", ".otf": "opentype" };

const copyFonts = async (font: { sans: FontConfig; mono: FontConfig }, out: string) => {
  const faces: string[] = [];
  for (const role of ["sans", "mono"] as const) {
    const f = font[role];
    const files = f.files ?? (f.file ? [{ path: f.file, weight: "100 900" }] : []);
    for (const [i, file] of files.entries()) {
      const ext = extname(file.path).toLowerCase();
      const name = `assets/fonts/${role}-${i}${ext}`;
      await copyFile(file.path, join(out, name));
      faces.push(`@font-face { font-family: "${f.family}"; src: url("${name}") format("${FONT_FORMAT[ext] ?? "woff2"}"); font-weight: ${file.weight}; }`);
    }
  }
  return faces.join("\n");
};

const soft = (color: string, pct: number) => `color-mix(in srgb, ${color} ${pct}%, transparent)`;

/** The theme as CSS custom properties, plus the font families. */
const tokens = (config: Config, theme: "light" | "dark") => {
  const c = config.colors[theme];
  return `:root {
  --bg: ${c.background}; --surface: ${c.surface}; --ink: ${c.ink}; --muted: ${c.muted}; --line: ${c.line};
  --line-strong: color-mix(in srgb, ${c.line} 70%, ${c.ink}); --fill: color-mix(in srgb, ${c.surface} 93%, ${c.ink});
  --accent: ${c.accent}; --accent-soft: ${soft(c.accent, 14)}; --second: ${c.second};
  --good: ${c.good}; --good-soft: ${soft(c.good, 14)}; --warn: ${c.warn}; --warn-soft: ${soft(c.warn, 18)};
  --bad: ${c.bad}; --bad-soft: ${soft(c.bad, 14)}; --highlight: ${c.highlight}; --shade: ${soft("#000", theme === "dark" ? 45 : 28)};
  --on-accent: ${theme === "dark" ? c.background : "#ffffff"};
  --sans: "${config.font.sans.family}", system-ui, sans-serif; --mono: "${config.font.mono.family}", ui-monospace, monospace;
}`;
};

/** Agent-written pages may not load anything from the network. */
const CSP =
  "default-src 'self' data: blob:; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self' data:; media-src 'self' data: blob:; connect-src 'self' data: blob:";

export type ComposeInput = {
  script: Script;
  config: Config;
  cast: Record<string, CastMember & { voice: string; speed: number }>;
  scenes: TimedScene[];
  total: number;
  scriptDir: string;
  out: string;
};

export const compose = async ({ script, config, cast, scenes, total, scriptDir, out }: ComposeInput) => {
  const portrait = script.format === "portrait";
  const { width, height } = SIZE[script.format];
  for (const dir of ["assets/audio", "assets/fonts", "assets/img", "assets/sfx"]) await mkdir(join(out, dir), { recursive: true });

  const motion = createMotion({ soundEffects: config.style.soundEffects });
  const marks = createMarks(motion);
  const asset = async (source: string) => {
    const full = isAbsolute(source) ? source : resolve(scriptDir, source);
    const path = `assets/img/${basename(full)}`;
    await copyFile(full, join(out, path));
    return { path, source: full };
  };

  const sceneHtml: string[] = [];
  const customStyles: string[] = [];
  const renderHooks: string[] = [];
  for (const [i, scene] of scenes.entries()) {
    const id = `s${i}`;
    const ctx: SceneContext = { id, scene, script, config, motion, portrait, at: sceneTime(scene), rich: marks.rich, word: marks.word, asset };
    const render = renderers[scene.type] as (ctx: SceneContext, scene: TimedScene) => string | Promise<string>;
    const body = await render(ctx, scene);
    if (scene.type === "custom") {
      if (scene.css) customStyles.push(`#${id} { ${scene.css} }`);
      if (scene.render) renderHooks.push(`${JSON.stringify(id)}: function (t, root) {\n${scene.render}\n}`);
    }

    // Alternate a sideways push and a zoom between scenes; an accent wipe covers every other cut.
    const zoom = i % 2 === 1;
    if (i > 0) {
      motion.sfx("whoosh", scene.start - 0.22, 0.45);
      if (zoom) motion.tween(`#${id}`, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1 }, scene.start, 0.45, "power3.out");
      else motion.tween(`#${id}`, { opacity: 0, x: portrait ? 0 : 220, y: portrait ? 220 : 0 }, { opacity: 1, x: 0, y: 0 }, scene.start, 0.45, "power3.out");
      if (i % 2 === 0) motion.keys("#wipe", [{ transform: "translateX(-101%)" }, { transform: "translateX(0%)", offset: 0.5 }, { transform: "translateX(101%)" }], scene.start - 0.22, 0.48, "power2.inOut");
    }
    if (i < scenes.length - 1) {
      const nextZoom = (i + 1) % 2 === 1;
      const exit = nextZoom ? { opacity: 0, scale: 0.9 } : { opacity: 0, x: portrait ? 0 : -220, y: portrait ? -220 : 0 };
      motion.tween(`#${id}`, undefined, exit, scene.end - 0.18, 0.2, "power2.in");
    }

    // A quick zoom and shake on punchlines.
    const punches = [...scene.lines.filter((l) => l.punch).map((l) => l.words[0]?.at ?? l.start), ...(scene.type === "punch" ? [scene.lines[scene.line ?? 0]?.words[0]?.at ?? scene.start] : [])];
    for (const at of punches) {
      motion.keys(
        `#${id} .shake`,
        [
          { transform: "scale(1) translate(0px, 0px)" },
          { transform: "scale(1.07) translate(-8px, 4px)", offset: 0.15 },
          { transform: "scale(1.06) translate(7px, -5px)", offset: 0.3 },
          { transform: "scale(1.05) translate(-4px, 3px)", offset: 0.45 },
          { transform: "scale(1) translate(0px, 0px)" },
        ],
        at - 0.05,
        0.7,
        "power2.out",
        { fill: "none" },
      );
    }
    sceneHtml.push(`<section id="${id}" class="clip scene scene-${scene.type}" data-start="${scene.start}" data-duration="${round3(scene.end - scene.start)}" data-track-index="1"><div class="shake">${body}</div></section>`);
  }

  // Captions: each word lights up as it is spoken; the speaker is shown in full, the others dimmed.
  const lines = scenes.flatMap((s) => s.lines);
  const castIds = Object.keys(cast);
  const captions = lines.map((line, i) => {
    line.words.forEach((w, wi) => motion.tween(`#c${i} .cw${wi}`, { opacity: 0.22, y: 8 }, { opacity: 1, y: 0 }, w.at - 0.04, 0.16, "power2.out"));
    castIds.forEach((cid) => motion.tween(`#spk-${cid}`, undefined, { opacity: cid === line.who ? 1 : 0.35, scale: cid === line.who ? 1 : 0.86 }, line.start, 0.18, "power2.out"));
    const duration = round3(line.speechEnd + (line.pauseAfter ?? 0.06) + 0.02);
    return `<div id="c${i}" class="clip caption-line" data-start="${line.start}" data-duration="${duration}" data-track-index="2"><div class="ctext">${line.words.map((w, wi) => `<span class="cw cw${wi}">${esc(w.w)}</span>`).join(" ")}</div></div>`;
  });
  const audio: string[] = [];
  for (const [i, line] of lines.entries()) {
    const name = `assets/audio/${basename(line.file)}`;
    await copyFile(line.file, join(out, name));
    audio.push(`<audio id="a${i}" src="${name}" data-start="${line.start}" data-duration="${line.duration}" data-track-index="3"></audio>`);
  }
  const sounds = new Set(motion.cues.map((c) => c.name));
  for (const name of sounds) await copyFile(join(packageRoot, "assets/sfx", `${name}.wav`), join(out, `assets/sfx/${name}.wav`));
  const sfx = motion.cues.map((c, i) => `<audio id="fx${i}" src="assets/sfx/${c.name}.wav" data-start="${c.time}" data-duration="0.6" data-volume="${c.volume}" data-track-index="4"></audio>`);
  motion.tween("#progress", { scaleX: 0 }, { scaleX: 1 }, 0, total, "none");

  const dock = castIds
    .map((cid, i) => `<div id="spk-${cid}" class="spk ${i === 0 ? "main" : "second"}"><div class="face">${esc(cast[cid]!.name[0] ?? "?")}</div><div class="nm">${esc(cast[cid]!.name)}${cast[cid]!.role ? `<span>${esc(cast[cid]!.role)}</span>` : ""}</div></div>`)
    .join("");

  // Diagrams are drawn in the page; the runtime needs their scene timing to reveal nodes as they are named.
  const usesMermaid = scenes.some((s) => s.type === "diagram");
  if (usesMermaid) await copyFile(join(dirname(require.resolve("mermaid/package.json")), "dist/mermaid.min.js"), join(out, "assets/mermaid.min.js"));
  const timing = Object.fromEntries(
    scenes.flatMap((s, i) =>
      s.type === "diagram" || s.type === "custom" ? [[`s${i}`, { type: s.type, start: s.start, end: s.end, lines: s.lines.map((l) => ({ start: l.start, words: l.words })) }]] : [],
    ),
  );

  await copyFile(join(packageRoot, "runtime/player.js"), join(out, "assets/player.js"));
  const css = [await readFile(join(packageRoot, "styles/sizzlr.css"), "utf8"), portrait ? await readFile(join(packageRoot, "styles/portrait.css"), "utf8") : "", tokens(config, script.theme), ...customStyles].join("\n");
  const fonts = await copyFonts(config.font, out);
  const corner = config.style.disclaimer === "corner" ? `<div class="corner-note">AI-generated · the source is the truth</div>` : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${width}, height=${height}" />
<meta http-equiv="Content-Security-Policy" content="${CSP}" />
<style>
${fonts}
${css}
</style>
${usesMermaid ? `<script src="assets/mermaid.min.js"></script>` : ""}
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${width}" data-height="${height}" class="${script.format} theme-${script.theme} bg-${config.style.background}">
  <header class="chrome"><div class="brand"><span class="dot"></span>${esc(script.title)}</div>${corner}</header>
  <div id="progress"></div>
  ${sceneHtml.join("\n  ")}
  ${captions.join("\n  ")}
  <div id="dock">${dock}</div>
  ${audio.join("\n  ")}
  ${sfx.join("\n  ")}
  <div id="wipe"></div>
</div>
<script>
window.__SIZZLR__ = ${JSON.stringify({ tweens: motion.tweens, counters: motion.counters, timing, mermaid: usesMermaid ? { colors: config.colors[script.theme], font: config.font.sans.family } : null })};
window.__SIZZLR_RENDER__ = {${renderHooks.join(",\n")}};
</script>
<script src="assets/player.js"></script>
</body>
</html>
`;
  await writeFile(join(out, "index.html"), html);
  return { sceneTypes: scenes.map((s) => s.type) satisfies SceneType[], animations: motion.tweens.length, sounds: motion.cues.length };
};
