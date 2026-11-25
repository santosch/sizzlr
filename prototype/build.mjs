// sizzlr prototype: script.json -> local voices -> HyperFrames project -> MP4, styled by sizzlr.config.json.
// Usage: node build.mjs <demoDir> [--render] [--quality draft|standard]
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { access, copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, isAbsolute, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const run = promisify(execFile);
const here = dirname(fileURLToPath(import.meta.url));
const spike = resolve(here, "..");
const hf = join(spike, "node_modules/.bin/hyperframes");
const env = { ...process.env, DO_NOT_TRACK: "1", HYPERFRAMES_NO_TELEMETRY: "1" };

const demoDir = resolve(process.argv[2]);
const args = process.argv.slice(3);
const shouldRender = args.includes("--render");
let quality = args.includes("--quality") ? args[args.indexOf("--quality") + 1] : undefined;

const script = JSON.parse(await readFile(join(demoDir, "script.json"), "utf8"));
const configPath = args.includes("--config") ? resolve(args[args.indexOf("--config") + 1]) : [join(demoDir, "sizzlr.config.json"), join(here, "sizzlr.config.json")].find((p) => existsSync(p));
const config = JSON.parse(await readFile(configPath, "utf8"));
const style = { background: "flat", cameraDrift: false, soundEffects: true, disclaimer: "outro", ...config.style };
// Cast members without a voice take the first configured voice nobody in the cast uses yet.
const usedVoices = new Set(Object.values(script.cast).map((m) => m.voice).filter(Boolean));
Object.values(script.cast)
  .filter((m) => !m.voice)
  .forEach((member) => {
    const next = config.voices.find((v) => !usedVoices.has(v.voice)) ?? config.voices[0];
    usedVoices.add(next.voice);
    Object.assign(member, { ...next, ...member });
  });
const theme = script.theme ?? "light";
quality ??= config.render?.quality ?? "draft";
const portrait = script.format === "portrait";
const [W, H] = portrait ? [1080, 1920] : [1920, 1080];
const out = join(demoDir, "project");
const cacheDir = join(here, ".cache/tts");
await mkdir(join(out, "assets/audio"), { recursive: true });
await mkdir(join(out, "assets/fonts"), { recursive: true });
await mkdir(join(out, "assets/img"), { recursive: true });
await mkdir(join(out, "assets/sfx"), { recursive: true });
await mkdir(cacheDir, { recursive: true });

const exists = async (p) => access(p).then(() => true, () => false);
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const r3 = (n) => Number(n.toFixed(3));

/** Runs fn over items with a fixed number of parallel workers. */
const pool = async (items, size, fn) => {
  const queue = [...items.entries()];
  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) await fn(next[1], next[0]);
  };
  await Promise.all(Array.from({ length: size }, worker));
};

/** Where speech starts and ends inside a clip, so silence can be cut from the timeline. */
const speechBounds = async (wav, duration) => {
  const { stderr } = await run("ffmpeg", ["-hide_banner", "-i", wav, "-af", "silencedetect=n=-42dB:d=0.06", "-f", "null", "-"]);
  const starts = [...stderr.matchAll(/silence_start: ([\d.]+)/g)].map((m) => Number(m[1]));
  const ends = [...stderr.matchAll(/silence_end: ([\d.]+)/g)].map((m) => Number(m[1]));
  const lead = starts[0] !== undefined && starts[0] < 0.02 ? ends[0] ?? 0 : 0;
  const last = starts.at(-1);
  const tail = last !== undefined && last > lead && (ends.length < starts.length || ends.at(-1) > duration - 0.02) ? last : duration;
  return { lead: r3(lead), speechEnd: r3(tail) };
};

// 1. Audio: one Kokoro clip per line, cached by voice, speed and text.
const lines = script.scenes.flatMap((scene) => scene.lines ?? []);
await pool(lines, 3, async (line) => {
  const who = script.cast[line.who];
  const spoken = line.say ?? line.text.replace(/==/g, "");
  const key = createHash("sha1").update(`${who.voice}|${who.speed}|${spoken}`).digest("hex").slice(0, 16);
  const wav = join(cacheDir, `${key}.wav`);
  const meta = join(cacheDir, `${key}.json`);
  if (!(await exists(meta))) {
    const { stdout } = await run(hf, ["tts", spoken, "-v", who.voice, "-s", String(who.speed), "-o", wav, "--json"], { env, cwd: spike });
    await writeFile(meta, stdout.trim().split("\n").at(-1));
  }
  const info = JSON.parse(await readFile(meta, "utf8"));
  line.duration = info.durationSeconds;
  Object.assign(line, info.speechEnd ? info : await speechBounds(wav, info.durationSeconds));
  if (!info.speechEnd) await writeFile(meta, JSON.stringify({ ...info, lead: line.lead, speechEnd: line.speechEnd }));
  line.file = `assets/audio/${key}.wav`;
  await copyFile(wav, join(out, line.file));
});

// 2. Timing: silence trimmed, tiny gaps, scenes cut right after their last word.
const LEAD_IN = 0.3;
const GAP = 0.06;
const SCENE_TAIL = 0.12;
let t = LEAD_IN;
for (const [si, scene] of script.scenes.entries()) {
  scene.start = si === 0 ? 0 : t;
  scene.lines ??= [];
  if (scene.lines.length === 0) t += scene.hold ?? 1.6;
  for (const line of scene.lines) {
    line.start = r3(t - line.lead + 0.02);
    const words = line.text.replace(/==/g, "").split(/\s+/).filter(Boolean);
    const weights = words.map((w) => w.length + 1.5 + (/[.,!?:;]$/.test(w) ? 3 : 0));
    const sum = weights.reduce((a, b) => a + b, 0);
    const span = line.speechEnd - line.lead;
    let acc = 0;
    line.words = words.map((w, i) => {
      const at = r3(line.start + line.lead + (acc / sum) * span);
      acc += weights[i];
      return { w, at };
    });
    t = line.start + line.speechEnd + (line.pauseAfter ?? GAP);
  }
  t += SCENE_TAIL;
  if (scene.type === "outro") t += 1.2;
  scene.end = r3(t);
}
const total = r3(t);
const lineAt = (scene, at) => scene.lines[Math.min(at ?? 0, scene.lines.length - 1)].words[0].at;
const wordAt = (scene, li, wi) => {
  const ws = scene.lines[Math.min(li, scene.lines.length - 1)].words;
  return ws[Math.min(wi, ws.length - 1)].at;
};

// 3. Static assets.
// A font is one variable file ("file") or several static ones ("files": [{ "path", "weight" }]).
const fontPath = (f) => (isAbsolute(f) ? f : join(spike, f));
const FORMAT = { woff2: "woff2", woff: "woff", ttf: "truetype", otf: "opentype" };
const fontFaces = [];
for (const role of ["sans", "mono"]) {
  const f = config.font[role];
  const files = f.files ?? [{ path: f.file, weight: "100 900" }];
  for (const [i, file] of files.entries()) {
    const ext = file.path.split(".").at(-1);
    const name = `assets/fonts/${role}-${i}.${ext}`;
    await copyFile(fontPath(file.path), join(out, name));
    fontFaces.push(`@font-face { font-family: "${f.family}"; src: url("${name}") format("${FORMAT[ext]}"); font-weight: ${file.weight}; }`);
  }
}

/** PNG size from its header. */
const pngSize = async (file) => {
  const b = await readFile(file);
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
};

// 4. Animation data, emitted as native Web Animations at the end.
const tweens = [];
const counts = [];
const tween = (sel, from, to, start, dur, ease = "power3.out", extra = {}) => tweens.push({ sel, from, to, start: r3(start), dur, ease, ...extra });
const keys = (sel, keyframes, start, dur, ease = "none", extra = {}) => tweens.push({ sel, keyframes, start: r3(start), dur, ease, ...extra });
const cues = [];
/** A sound effect at a time; pops closer than 0.14 s to the previous pop are dropped. */
const sfx = (name, time, volume = 0.5) => {
  if (!style.soundEffects) return;
  if (name === "pop" && cues.some((c) => c.name === "pop" && Math.abs(c.time - time) < 0.14)) return;
  cues.push({ name, time: r3(Math.max(0, time)), volume });
};
const POP_ITEMS = /\.(chip|stat|tile|dec|todo|node|layer|pw|hl|panel)-\d+$/;
const reveal = (sel, time, { rotationTo = 0, ...from } = { opacity: 0, y: 28 }, ease = "power3.out", duration = 0.45) => {
  if (POP_ITEMS.test(sel)) sfx("pop", time, 0.32);
  if (/\.(sticker|cnote|stamp|verdict-\d+)$/.test(sel)) sfx("thud", time + duration * 0.8, 0.7);
  tween(sel, from, { opacity: 1, x: 0, y: 0, scale: 1, rotation: rotationTo }, time, duration, ease);
};
const count = (sel, from, to, start, dur, ease = "power2.out") => counts.push({ sel, from, to, start: r3(start), dur, ease });

let markId = 0;
/** Text with ==marked== parts; each mark draws its underline shortly after `time`. */
const rich = (text, time) =>
  esc(text).replace(/==(.+?)==/g, (_, inner) => {
    const id = `mk${markId++}`;
    if (time !== undefined) tween(`#${id} i`, { scaleX: 0 }, { scaleX: 1 }, time + 0.3, 0.45, "power3.out");
    return `<span class="mark" id="${id}">${inner}<i></i></span>`;
  });

/** Words of a text, each knowing whether it sits inside a ==mark== that may span several words. */
const markedWords = (text) => {
  let on = false;
  return text.split(/\s+/).filter(Boolean).map((raw) => {
    let w = raw;
    if (w.startsWith("==")) {
      on = true;
      w = w.slice(2);
    }
    const marked = on;
    if (w.endsWith("==")) {
      on = false;
      w = w.slice(0, -2);
    }
    return { w, marked };
  });
};
const wordHtml = (word, time) => (word.marked ? rich(`==${word.w}==`, time) : esc(word.w));

const check = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;
const cursorSvg = `<svg viewBox="0 0 24 24" width="44" height="44"><path d="M4 2l15 9.5-6.6 1.3 3.9 7.2-3 1.6-3.9-7.3L4 19z" fill="#18181b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/** A tick step that gives 4-6 gridlines. */
const niceStep = (max) => {
  const raw = max / 5;
  const pow = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => max / s <= 6);
};

const scenes = {
  title: (s, id) => {
    reveal(`#${id} .kicker`, s.start + 0.1, { opacity: 0, y: 16 });
    const tws = markedWords(s.title);
    tws.forEach((_, i) => reveal(`#${id} h1 .w${i}`, s.start + 0.18 + i * 0.07, { opacity: 0, y: 50 }, "power4.out", 0.5));
    if (s.subtitle) reveal(`#${id} .subtitle`, lineAt(s, 1));
    const title = tws.map((w, i) => `<span class="tw w${i}">${wordHtml(w, s.start + 0.5)}</span>`).join(" ");
    return `<div class="stack center"><div class="kicker mono">${esc(s.kicker)}</div><h1 class="display">${title}</h1>${s.subtitle ? `<div class="subtitle">${rich(s.subtitle, lineAt(s, 1))}</div>` : ""}</div>`;
  },
  punch: (s, id) => {
    const li = s.line ?? 0;
    const words = markedWords(s.text);
    const spoken = s.lines[li].words;
    // Each word lands when the voice says it: the next spoken word with the same letters, else right after the previous one.
    const norm = (w) => w.toLowerCase().replace(/[^a-z0-9]/g, "");
    let cursor = 0;
    words.forEach((word, i) => {
      const found = spoken.findIndex((sw, k) => k >= cursor && norm(sw.w) === norm(word.w));
      const k = found === -1 ? Math.min(cursor, spoken.length - 1) : found;
      cursor = k + 1;
      reveal(`#${id} .pw${i}`, spoken[k].at - 0.05, { opacity: 0, scale: 1.9, y: -10 }, "power4.out", 0.28);
    });
    if (s.sub) reveal(`#${id} .psub`, lineAt(s, s.subAt ?? li + 1));
    const html = words.map((w, i) => `<span class="pw pw${i}">${wordHtml(w, wordAt(s, li, i))}</span>`).join(" ");
    return `<div class="stack center"><div class="punch tone-${s.tone ?? "plain"}">${html}</div>${s.sub ? `<div class="psub">${rich(s.sub, lineAt(s, s.subAt ?? li + 1))}</div>` : ""}</div>`;
  },
  big: (s, id) => {
    if (s.kicker) reveal(`#${id} .kicker`, s.start + 0.1);
    const time = lineAt(s, s.at);
    reveal(`#${id} .bignum`, time, { opacity: 0, scale: 0.5 }, "back.out", 0.5);
    if (s.countFrom !== undefined) count(`#${id} .bignum .v`, s.countFrom, s.value, time, s.countDuration ?? 1.1, "power2.inOut");
    if (s.label) reveal(`#${id} .biglabel`, time + 0.35);
    if (s.footnote) reveal(`#${id} .footnote`, lineAt(s, s.footnoteAt ?? s.at) + 0.2);
    const shown = s.countFrom !== undefined ? Number(s.countFrom).toLocaleString("en-US") : esc(s.value);
    return `<div class="stack center">
      ${s.kicker ? `<div class="kicker mono">${esc(s.kicker)}</div>` : ""}
      <div class="bignum tone-${s.tone ?? "plain"}${String(s.value).length > 7 ? " wordy" : ""}">${s.prefix ? `<span class="affix">${esc(s.prefix)}</span>` : ""}<span class="v">${shown}</span>${s.suffix ? `<span class="affix">${esc(s.suffix)}</span>` : ""}</div>
      ${s.label ? `<div class="biglabel">${rich(s.label, time + 0.35)}</div>` : ""}
      ${s.footnote ? `<div class="footnote mono">${esc(s.footnote)}</div>` : ""}
    </div>`;
  },
  chart: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const series = s.series ?? [{ name: "", tone: "plain" }];
    const totals = s.categories.map((c) => (s.stack ? c.values.reduce((a, b) => a + b, 0) : Math.max(...c.values)));
    const max = s.max ?? Math.max(...totals, s.limit?.value ?? 0) * 1.12;
    const step = niceStep(max);
    const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
    const pct = (v) => ((v / max) * 100).toFixed(2);
    const fmt = (v) => `${Number(v.toFixed(2)).toLocaleString("en-US")}${s.unit ? ` ${s.unit}` : ""}`;
    reveal(`#${id} .axis`, s.start + 0.2, { opacity: 0 }, "none", 0.4);
    const cats = s.categories.map((c, ci) => {
      const time = lineAt(s, c.at ?? 0) + (s.stagger ?? 0.12) * ci;
      reveal(`#${id} .cat-${ci} .clabel`, time, { opacity: 0, y: 12 });
      let base = 0;
      const bars = c.values.map((v, vi) => {
        const tone = c.tones?.[vi] ?? series[vi]?.tone ?? "plain";
        const t2 = time + (s.stack ? vi * 0.55 : vi * 0.35);
        tween(`#${id} .cat-${ci} .b-${vi} .fill`, { scaleY: 0 }, { scaleY: 1 }, t2, s.stack ? 0.55 : 0.8, "power3.out");
        reveal(`#${id} .cat-${ci} .b-${vi} .val`, t2 + 0.45, { opacity: 0, y: 10 }, "power3.out", 0.3);
        const label = c.labels?.[vi] ?? fmt(v);
        const style = s.stack ? `bottom:${pct(base)}%;height:${pct(v)}%` : `height:${pct(v)}%`;
        base += v;
        return `<div class="bar2 b-${vi} tone-${tone}${s.stack ? " seg" : ""}" style="${s.stack ? style : ""}"><div class="fill" style="${s.stack ? "height:100%" : style}"></div><div class="val" style="${s.stack ? "" : `bottom:calc(${pct(v)}% + 8px)`}">${esc(label)}</div></div>`;
      });
      return `<div class="cat cat-${ci}"><div class="bars2${s.stack ? " stacked" : ""}">${bars.join("")}</div><div class="clabel">${esc(c.label)}</div></div>`;
    });
    let limit = "";
    if (s.limit) {
      const lt = lineAt(s, s.limit.at ?? 0);
      tween(`#${id} .limit`, { scaleX: 0 }, { scaleX: 1 }, lt, 0.6, "power3.out");
      reveal(`#${id} .limit .ltag`, lt + 0.4, { opacity: 0, x: 20 });
      limit = `<div class="limit" style="bottom:${pct(s.limit.value)}%"><span class="ltag">${esc(s.limit.label)}</span></div>`;
    }
    if (s.note) reveal(`#${id} .cnote`, lineAt(s, s.note.at ?? 0) + 0.2, { opacity: 0, scale: 1.6, rotationTo: -2 }, "back.out", 0.35);
    const legend = series.length > 1 ? `<div class="legend">${series.map((se) => `<span class="lg tone-${se.tone}"><i></i>${esc(se.name)}</span>`).join("")}</div>` : "";
    if (legend) reveal(`#${id} .legend`, s.start + 0.25);
    return `<div class="stack">
      <div class="chead"><h2>${rich(s.heading, s.start + 0.1)}</h2>${legend}</div>
      <div class="chart">
        <div class="axis">${ticks.map((v) => `<div class="tick" style="bottom:${pct(v)}%"><span>${esc(fmt(v))}</span></div>`).join("")}</div>
        <div class="plot">${cats.join("")}${limit}</div>
        ${s.note ? `<div class="cnote">${rich(s.note.text)}</div>` : ""}
      </div>
    </div>`;
  },
  shot: async (s, id) => {
    const src = isAbsolute(s.image) ? s.image : resolve(demoDir, s.image);
    const file = `assets/img/${basename(src)}`;
    await copyFile(src, join(out, file));
    const { w, h } = await pngSize(src);
    const VW = portrait ? 980 : 1560;
    const VH = Math.round(Math.min(VW * (h / w), portrait ? 1100 : 600));
    const imgH = VW * (h / w);
    reveal(`#${id} .frame`, s.start + 0.05, { opacity: 0, y: 60, scale: 0.94 }, "power3.out", 0.6);
    if (s.heading) reveal(`#${id} h2`, s.start + 0.1);
    const boxes = (s.focus ?? []).map((f, fi) => {
      const time = f.word !== undefined ? wordAt(s, f.at ?? 0, f.word) : lineAt(s, f.at ?? 0);
      const sc = Math.min(f.zoom ?? 2.4, 0.86 / Math.max(f.w, (f.h * imgH) / VH));
      const cx = (f.x + f.w / 2) * VW;
      const cy = (f.y + f.h / 2) * imgH;
      const x = Math.min(0, Math.max(VW - VW * sc, VW / 2 - cx * sc));
      const y = Math.min(0, Math.max(VH - imgH * sc, VH / 2 - cy * sc));
      tween(`#${id} .cam`, null, { x: r3(x), y: r3(y), scale: r3(sc) }, time - 0.15, 0.9, "power2.inOut");
      reveal(`#${id} .hl-${fi}`, time + 0.45, { opacity: 0, scale: 1.08 }, "power3.out", 0.35);
      reveal(`#${id} .hl-${fi} .btag`, time + 0.6, { opacity: 0, y: 10 }, "back.out", 0.3);
      if (fi > 0) tween(`#${id} .hl-${fi - 1}`, null, { opacity: 0 }, time - 0.1, 0.25, "power1.inOut");
      const cur = { x: (f.x + f.w * 0.82) * VW, y: (f.y + f.h * 0.75) * imgH };
      tween(`#${id} .cursor`, null, { x: r3(cur.x), y: r3(cur.y), opacity: 1 }, time - 0.1, 0.7, "power2.inOut");
      keys(`#${id} .cursor i`, [{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(1.6)", opacity: 0 }], time + 0.62, 0.5, "power2.out");
      return `<div class="hl hl-${fi} tone-${f.tone ?? "accent"}" style="--s:${r3(sc)};left:${(f.x * 100).toFixed(2)}%;top:${(f.y * 100).toFixed(2)}%;width:${(f.w * 100).toFixed(2)}%;height:${(f.h * 100).toFixed(2)}%">${f.label ? `<span class="btag">${esc(f.label)}</span>` : ""}</div>`;
    });
    const back = s.zoomOutAt !== undefined ? lineAt(s, s.zoomOutAt) : undefined;
    if (back !== undefined) {
      tween(`#${id} .cam`, null, { x: 0, y: 0, scale: 1 }, back - 0.1, 0.8, "power2.inOut");
      tween(`#${id} .hl`, null, { opacity: 0 }, back - 0.1, 0.3, "power1.inOut");
    }
    return `<div class="stack center shotstack">
      ${s.heading ? `<h2>${rich(s.heading, s.start + 0.1)}</h2>` : ""}
      <div class="frame" style="width:${VW}px">
        <div class="chromebar"><i></i><i></i><i></i><span class="url mono">${esc(s.url ?? "")}</span></div>
        <div class="viewport" style="height:${VH}px">
          <div class="cam" style="width:${VW}px;height:${imgH}px">
            <img src="${file}" style="width:${VW}px;height:${imgH}px" />
            ${boxes.join("")}
            <div class="cursor" style="opacity:0">${cursorSvg}<i></i></div>
          </div>
        </div>
      </div>
    </div>`;
  },
  stats: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = lineAt(s, it.at) + i * 0.15;
      reveal(`#${id} .stat-${i}`, time, { opacity: 0, y: 60, scale: 0.9 }, "back.out", 0.5);
      if (/^\d+$/.test(it.value)) count(`#${id} .stat-${i} .value`, 0, Number(it.value), time, 0.8);
      return `<div class="stat stat-${i} tone-${it.tone}"><div class="value">${/^\d+$/.test(it.value) ? "0" : esc(it.value)}</div><div class="label">${rich(it.label, time)}</div></div>`;
    });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="row">${items.join("")}</div></div>`;
  },
  chips: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = it.word !== undefined ? wordAt(s, it.at ?? 0, it.word) : lineAt(s, it.at) + i * 0.3;
      reveal(`#${id} .chip-${i}`, time, { opacity: 0, y: 30, scale: 0.8 }, "back.out", 0.4);
      return `<div class="chip chip-${i}">${check}<span>${esc(it.label)}</span></div>`;
    });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="chips">${items.join("")}</div></div>`;
  },
  code: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    reveal(`#${id} .codecard`, s.start + 0.2, { opacity: 0, y: 40, scale: 0.97 });
    const rows = s.code.map((r, i) => {
      const time = lineAt(s, r.at ?? 0) + i * 0.1;
      reveal(`#${id} .cl-${i}`, time, { opacity: 0, x: -20 }, "power2.out", 0.3);
      if (r.kind === "add") keys(`#${id} .cl-${i} .flash`, [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }], time + 0.25, 0.8, "power2.out");
      const mark = { add: "+", del: "−", ctx: " " }[r.kind ?? "ctx"];
      return `<div class="cl cl-${i} k-${r.kind ?? "ctx"}"><span class="flash"></span><span class="mark2">${mark}</span><span class="src">${esc(r.text)}</span></div>`;
    });
    (s.callouts ?? []).forEach((c, i) => reveal(`#${id} .callout-${i}`, lineAt(s, c.at), { opacity: 0, y: 20, scale: 0.9 }, "back.out", 0.4));
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2>
      <div class="codecard"><div class="file mono">${esc(s.file)}</div><div class="code mono">${rows.join("")}</div></div>
      <div class="callouts">${(s.callouts ?? []).map((c, i) => `<div class="callout callout-${i}">${esc(c.text)}</div>`).join("")}</div>
    </div>`;
  },
  checks: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = lineAt(s, it.at) + i * 0.2;
      reveal(`#${id} .tile-${i}`, time, { opacity: 0, y: 40, scale: 0.9 }, "back.out", 0.45);
      const numeric = /^\d+$/.test(it.value);
      if (numeric) count(`#${id} .tile-${i} .value`, 0, Number(it.value), time, 0.8);
      if (it.sticker) reveal(`#${id} .tile-${i} .sticker`, lineAt(s, it.stickerAt ?? it.at) + 0.2, { opacity: 0, scale: 2.4, rotationTo: -6 }, "back.out", 0.3);
      return `<div class="tile tile-${i} tone-${it.tone}"><div class="value${numeric ? "" : " word"}">${numeric ? "0" : esc(it.value)}</div><div class="label">${esc(it.label)}</div>${it.sticker ? `<div class="sticker">${esc(it.sticker)}</div>` : ""}</div>`;
    });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="tiles">${items.join("")}</div></div>`;
  },
  chapter: (s, id) => {
    const chapters = script.scenes.filter((x) => x.type === "chapter");
    const n = chapters.indexOf(s);
    reveal(`#${id} .chnum`, s.start + 0.05, { opacity: 0, y: 30 }, "power4.out", 0.4);
    reveal(`#${id} .chtitle`, s.start + 0.12, { opacity: 0, y: 40 }, "power4.out", 0.45);
    chapters.forEach((_, i) => reveal(`#${id} .toc-${i}`, s.start + 0.1 + i * 0.05, { opacity: 0, x: 30 }, "power3.out", 0.35));
    return `<div class="stack chapterstack">
      <div class="chleft"><div class="chnum mono">Chapter ${n + 1} of ${chapters.length}</div><div class="chtitle">${rich(s.title, s.start + 0.3)}</div></div>
      <ol class="toc">${chapters.map((c, i) => `<li class="toc-${i}${i === n ? " now" : ""}${i < n ? " done" : ""}"><span class="mono">${i + 1}</span>${esc(c.title.replace(/==/g, ""))}</li>`).join("")}</ol>
    </div>`;
  },
  decisions: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = lineAt(s, it.at);
      reveal(`#${id} .dec-${i}`, time, { opacity: 0, x: -60 }, "power3.out", 0.45);
      return `<div class="dec dec-${i}"><div class="topic">${esc(it.topic)}</div><div class="after">${rich(it.after, time)}</div>${it.why ? `<div class="why">${esc(it.why)}</div>` : ""}</div>`;
    });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="decs">${items.join("")}</div></div>`;
  },
  todo: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = lineAt(s, it.at) + (it.n ?? 0) * 0.35;
      reveal(`#${id} .todo-${i}`, time, { opacity: 0, x: -40 }, "power3.out", 0.4);
      return `<div class="todo todo-${i}"><span class="box"></span><span>${esc(it.label)}</span>${it.tag ? `<span class="ttag mono">${esc(it.tag)}</span>` : ""}</div>`;
    });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="todos">${items.join("")}</div></div>`;
  },
  chain: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const parts = s.nodes.flatMap((n, i) => {
      const time = n.at !== undefined ? lineAt(s, n.at) + (n.n ?? 0) * 0.35 : lineAt(s, s.at ?? 0) + i * (s.step ?? 0.5);
      reveal(`#${id} .node-${i}`, time, { opacity: 0, y: 24, scale: 0.85 }, "back.out", 0.4);
      const node = `<div class="node node-${i} tone-${n.tone ?? "plain"}">${n.kicker ? `<em class="mono">${esc(n.kicker)}</em>` : ""}${esc(n.label)}${n.note ? `<small>${esc(n.note)}</small>` : ""}</div>`;
      if (i === 0) return [node];
      reveal(`#${id} .arrow-${i}`, time - 0.12, { opacity: 0, x: -14 }, "power2.out", 0.25);
      return [`<div class="arrow arrow-${i}">${portrait ? "↓" : "→"}</div>`, node];
    });
    if (s.caption) reveal(`#${id} .chaincap`, lineAt(s, s.captionAt ?? 0) + 0.3, { opacity: 0, y: 16 });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="chain">${parts.join("")}</div>${s.caption ? `<div class="chaincap">${rich(s.caption, lineAt(s, s.captionAt ?? 0) + 0.3)}</div>` : ""}</div>`;
  },
  layers: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const items = s.items.map((it, i) => {
      const time = lineAt(s, it.at);
      reveal(`#${id} .layer-${i}`, time, { opacity: 0, x: 80 }, "power3.out", 0.45);
      reveal(`#${id} .layer-${i} .lock`, time + 0.35, { opacity: 0, scale: 2.2, rotationTo: 0 }, "back.out", 0.3);
      return `<div class="layer layer-${i}" style="margin-left:${i * 70}px"><span class="lnum mono">${i + 1}</span><div class="ltext"><div class="ltitle">${rich(it.title, time)}</div><div class="lwho">${esc(it.who)}</div></div><span class="lock">${esc(it.badge ?? "")}</span></div>`;
    });
    if (s.caption) reveal(`#${id} .chaincap`, lineAt(s, s.captionAt ?? 0) + 0.3, { opacity: 0, y: 16 });
    return `<div class="stack"><h2>${rich(s.heading, s.start + 0.1)}</h2><div class="layers">${items.join("")}</div>${s.caption ? `<div class="chaincap">${rich(s.caption)}</div>` : ""}</div>`;
  },
  compare: (s, id) => {
    reveal(`#${id} h2`, s.start + 0.1);
    const block = (b) =>
      ({
        page: () => `<div class="mrow"><div class="mpage" style="font-size:${b.size}px">${esc(b.text)}</div>${b.annot ? `<span class="annot">${esc(b.annot)}</span>` : ""}</div>`,
        card: () => `<div class="mcard"><div class="mrow"><div class="mctitle${b.custom ? " custom" : ""}" style="font-size:${b.size}px">${esc(b.text)}</div>${b.annot ? `<span class="annot${b.custom ? " bad" : ""}">${esc(b.annot)}</span>` : ""}</div>${Array.from({ length: b.lines ?? 2 }, (_, i) => `<i style="width:${88 - i * 22}%"></i>`).join("")}</div>`,
        text: () => `<div class="mtext">${esc(b.text)}</div>`,
        button: () => `<span class="mbtn${b.primary ? " primary" : ""}">${esc(b.text)}</span>`,
      })[b.kind]();
    const panels = s.panels.map((p, pi) => {
      reveal(`#${id} .panel-${pi}`, lineAt(s, p.at ?? 0) + pi * 0.25, { opacity: 0, y: 50, scale: 0.94 }, "back.out", 0.5);
      const verdicts = (p.verdicts ?? []).map((v, vi) => {
        const time = lineAt(s, v.at) + 0.3;
        reveal(`#${id} .panel-${pi} .verdict-${vi}`, time, { opacity: 0, scale: 2.6, rotationTo: -6 }, "power4.in", 0.22);
        if (vi > 0) tween(`#${id} .panel-${pi} .verdict-${vi - 1}`, null, { opacity: 0, scale: 0.8 }, time - 0.05, 0.15, "power2.in");
        return `<span class="verdict verdict-${vi} tone-${v.tone}">${esc(v.text)}</span>`;
      });
      return `<div class="panel panel-${pi}"><div class="plabel">${esc(p.label)}</div><div class="mockwin"><div class="mock">${p.blocks.map(block).join("")}</div>${verdicts.join("")}</div></div>`;
    });
    return `<div class="stack"><div class="chead"><h2>${rich(s.heading, s.start + 0.1)}</h2><span class="illu mono">Illustration · shown at 2×</span></div><div class="panels">${panels.join("")}</div></div>`;
  },
  outro: (s, id) => {
    const tws = markedWords(s.title);
    tws.forEach((_, i) => reveal(`#${id} h1 .w${i}`, s.start + 0.1 + i * 0.07, { opacity: 0, y: 50 }, "power4.out", 0.5));
    reveal(`#${id} .subtitle`, s.start + 0.4);
    const last = s.lines.at(-1);
    if (s.stamp) reveal(`#${id} .stamp`, last.start + last.speechEnd + 0.05, { opacity: 0, scale: 3.2, rotationTo: -8 }, "power4.in", 0.25);
    const title = tws.map((w, i) => `<span class="tw w${i}">${wordHtml(w, s.start + 0.5)}</span>`).join(" ");
    const note = style.disclaimer === "outro" ? `<div class="disclaimer">AI-generated from ${esc(script.source ?? "the source")}. The source is the truth.</div>` : "";
    if (note) reveal(`#${id} .disclaimer`, s.start + 0.6, { opacity: 0 }, "none", 0.4);
    return `<div class="stack center"><h1 class="display">${title}</h1><div class="subtitle mono">${esc(s.subtitle)}</div>${s.stamp ? `<div class="stamp">${esc(s.stamp)}</div>` : ""}${note}</div>`;
  },
};

// 5. Scenes with transitions: alternate push and zoom; an accent wipe on every other cut; slow camera drift.
const sceneHtml = [];
for (const [i, s] of script.scenes.entries()) {
  const id = `s${i}`;
  const body = await scenes[s.type](s, id);
  const style = i % 2 ? "zoom" : "push";
  if (i > 0) {
    sfx("whoosh", s.start - 0.22, 0.45);
    if (style === "push") tween(`#${id}`, { opacity: 0, x: portrait ? 0 : 220, y: portrait ? 220 : 0 }, { opacity: 1, x: 0, y: 0 }, s.start, 0.45, "power3.out");
    else tween(`#${id}`, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1 }, s.start, 0.45, "power3.out");
    if (i % 2 === 0) keys("#wipe", [{ transform: "translateX(-101%)" }, { transform: "translateX(0%)", offset: 0.5 }, { transform: "translateX(101%)" }], s.start - 0.22, 0.48, "power2.inOut");
  }
  if (i < script.scenes.length - 1) {
    const next = (i + 1) % 2 ? "zoom" : "push";
    const exitTo = next === "push" ? { opacity: 0, x: portrait ? 0 : -220, y: portrait ? -220 : 0 } : { opacity: 0, scale: 0.9 };
    tween(`#${id}`, null, exitTo, s.end - 0.18, 0.2, "power2.in");
  }
  if (style.cameraDrift) keys(`#${id} .stack`, [{ transform: "scale(1)" }, { transform: `scale(${s.type === "shot" ? 1 : 1.04})` }], s.start, s.end - s.start, "none");
  // Punch-in: a quick zoom and shake on flagged lines, and on every punch scene.
  const punchAt = [...s.lines.filter((l) => l.punch).map((l) => l.words[0].at), ...(s.type === "punch" ? [s.lines[s.line ?? 0].words[0].at] : [])];
  punchAt.forEach((at) =>
    keys(`#${id} .shake`, [
      { transform: "scale(1) translate(0px, 0px)" },
      { transform: "scale(1.07) translate(-8px, 4px)", offset: 0.15 },
      { transform: "scale(1.06) translate(7px, -5px)", offset: 0.3 },
      { transform: "scale(1.05) translate(-4px, 3px)", offset: 0.45 },
      { transform: "scale(1) translate(0px, 0px)" },
    ], at - 0.05, 0.7, "power2.out", { fill: "none" }),
  );
  sceneHtml.push(`<section id="${id}" class="clip scene scene-${s.type}" data-start="${r3(s.start)}" data-duration="${r3(s.end - s.start)}" data-track-index="1"><div class="shake">${body}</div></section>`);
}

// 6. Captions: speaker chip and the line, each word lighting up as it is spoken.
const captionHtml = lines.map((line, i) => {
  const who = script.cast[line.who];
  const dur = line.speechEnd + (line.pauseAfter ?? GAP) + 0.02;
  reveal(`#c${i} .who`, line.start, { opacity: 0, x: -16 }, "power3.out", 0.2);
  line.words.forEach((w, wi) => tween(`#c${i} .cw${wi}`, { opacity: 0.22, y: 8 }, { opacity: 1, y: 0 }, w.at - 0.04, 0.16, "power2.out"));
  const text = line.words.map((w, wi) => `<span class="cw cw${wi}">${esc(w.w)}</span>`).join(" ");
  return `<div id="c${i}" class="clip caption2 who-${who.tone}" data-start="${r3(line.start)}" data-duration="${r3(dur)}" data-track-index="2"><div class="who"><b>${esc(who.name[0])}</b>${esc(who.name)} <span>${esc(who.role)}</span></div><div class="ctext">${text}</div></div>`;
});
const castIds = Object.keys(script.cast);
// The speaking person is shown in full, the others dimmed.
lines.forEach((line) => castIds.forEach((cid) => tween(`#spk-${cid}`, null, { opacity: cid === line.who ? 1 : 0.35, scale: cid === line.who ? 1 : 0.86 }, line.start, 0.18, "power2.out")));
const dockHtml = `<div id="dock">${castIds.map((cid) => { const c = script.cast[cid]; return `<div id="spk-${cid}" class="spk who-${c.tone}"><div class="face">${esc(c.name[0])}</div><div class="nm">${esc(c.name)}<span>${esc(c.role)}</span></div></div>`; }).join("")}</div>`;
const sfxHtml = cues.map((c, i) => `<audio id="fx${i}" src="assets/sfx/${c.name}.wav" data-start="${c.time}" data-duration="0.6" data-volume="${c.volume}" data-track-index="4"></audio>`);
const audioHtml = lines.map((line, i) => `<audio id="a${i}" src="${line.file}" data-start="${r3(line.start)}" data-duration="${r3(line.duration)}" data-track-index="3"></audio>`);

// 7. Background motion and progress.
tween("#progress", { scaleX: 0 }, { scaleX: 1 }, 0, total, "none");
if (style.background === "glow") [0, 1, 2].forEach((b) => {
  const path = [
    [-200, -120, 1],
    [260, 140, 1.25],
    [-120, 260, 0.9],
    [200, -160, 1.15],
  ].map((p, k) => ({ transform: `translate(${p[0] * (b % 2 ? -1 : 1)}px, ${p[1]}px) scale(${p[2]})`, offset: k / 3 }));
  keys(`#bg .blob${b}`, path, 0, total, "linear");
});
if (style.background === "glow") keys("#grid", [{ transform: "translate(0px, 0px)" }, { transform: "translate(-160px, -90px)" }], 0, total, "linear");

const emitWaapi = () => `const TWEENS = ${JSON.stringify(tweens)};
  const COUNTS = ${JSON.stringify(counts)};
  const EASE = {
    "power1.inOut": "cubic-bezier(0.45, 0, 0.55, 1)", "power2.out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)", "power2.in": "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
    "power2.inOut": "cubic-bezier(0.455, 0.03, 0.515, 0.955)", "power3.out": "cubic-bezier(0.215, 0.61, 0.355, 1)",
    "power4.out": "cubic-bezier(0.165, 0.84, 0.44, 1)", "power4.in": "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
    "back.out": "cubic-bezier(0.34, 1.56, 0.64, 1)", none: "linear", linear: "linear",
  };
  const TRANSFORM_KEYS = ["x", "y", "scale", "scaleX", "scaleY", "rotation"];
  const frame = (p) => {
    const k = {};
    if ("opacity" in p) k.opacity = p.opacity;
    if (TRANSFORM_KEYS.some((key) => key in p)) {
      k.transform = \`translate(\${p.x ?? 0}px, \${p.y ?? 0}px) scale(\${p.scaleX ?? p.scale ?? 1}, \${p.scaleY ?? p.scale ?? 1}) rotate(\${p.rotation ?? 0}deg)\`;
    }
    return k;
  };
  const started = new Set();
  for (const t of TWEENS) {
    document.querySelectorAll(t.sel).forEach((el, i) => {
      // Only an element's first animation fills backwards; a later one would otherwise override it from time 0.
      const fill = t.fill ?? (started.has(el) || !(t.from || t.keyframes) ? "forwards" : "both");
      if (!t.fill) started.add(el);
      const keyframes = t.keyframes ?? (t.from ? [frame(t.from), frame(t.to)] : [frame(t.to)]);
      const a = el.animate(keyframes, {
        duration: t.dur * 1000,
        delay: (t.start + (t.stagger ?? 0) * i) * 1000,
        easing: EASE[t.ease] ?? "linear",
        iterations: (t.repeat ?? 0) + 1,
        direction: t.yoyo ? "alternate" : "normal",
        fill,
      });
      a.pause();
    });
  }
  const EASE_FN = { "power2.out": (p) => 1 - (1 - p) ** 2, "power2.inOut": (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) };
  const drawCounts = (time) => {
    for (const c of COUNTS) {
      const p = Math.min(1, Math.max(0, (time - c.start) / c.dur));
      document.querySelector(c.sel).textContent = Math.round(c.from + (c.to - c.from) * EASE_FN[c.ease](p)).toLocaleString("en-US");
    }
  };
  window.addEventListener("hf-seek", (e) => drawCounts(e.detail.time));
  drawCounts(0);`;

const cssFiles = ["base.css", portrait && "format-portrait.css", "v2.css", portrait && "v2-portrait.css", "v3.css"].filter(Boolean);
for (const name of new Set(cues.map((c) => c.name))) await copyFile(join(here, "sfx", `${name}.wav`), join(out, `assets/sfx/${name}.wav`));
const c = config.colors[theme];
const soft = (v, pct) => `color-mix(in srgb, ${v} ${pct}%, transparent)`;
const configCss = `
:root, .theme-${theme} {
  --bg: ${c.background}; --surface: ${c.surface}; --ink: ${c.ink}; --label: ${c.muted}; --muted: ${c.muted};
  --line: ${c.line}; --line-strong: color-mix(in srgb, ${c.line} 70%, ${c.ink}); --fill: color-mix(in srgb, ${c.surface} 92%, ${c.ink});
  --blue: ${c.accent}; --blue-50: ${soft(c.accent, 14)}; --offblack: ${c.second};
  --green: ${c.good}; --green-50: ${soft(c.good, 14)}; --amber: ${c.warn}; --amber-100: ${soft(c.warn, 18)};
  --red: ${c.bad}; --red-50: ${soft(c.bad, 14)}; --hl: ${c.highlight}; --shade: ${soft("#000", theme === "dark" ? 45 : 28)};
}
html, body, #root { background: var(--bg); }
#root { font-family: "${config.font.sans.family}", system-ui, sans-serif; color: var(--ink); }
.mono, .chrome2 .brand, .tick span, .annot { font-family: "${config.font.mono.family}", ui-monospace, monospace; }
.theme-dark .spk.who-blue .face, .theme-dark .caption2.who-blue .who b { color: ${c.background}; }
.theme-dark .mockwin { background: #fff; }
.mock { font-family: "${config.font.sans.family}", sans-serif; }
.annot { color: var(--blue); background: var(--blue-50); } .annot.bad { color: var(--red); background: var(--red-50); }
.cl.k-add { background: var(--green-50); } .cl.k-del { background: var(--red-50); } .cl .flash { background: var(--blue-50); } .mbtn.primary { background: var(--blue); border-color: var(--blue); }
.disclaimer { margin-top: 18px; font-size: 20px; color: var(--muted); }
.chrome2 .ai { background: var(--fill); color: var(--muted); font-weight: 400; }
`;
const css = (await Promise.all(cssFiles.map((f) => readFile(join(here, f), "utf8")))).join("\n") + configCss;
const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=${W}, height=${H}" />
<style>
${fontFaces.join("\n")}
${css}
</style>
</head>
<body>
<div id="root" data-composition-id="main" data-start="0" data-duration="${total}" data-width="${W}" data-height="${H}" class="${portrait ? "portrait" : "landscape"} theme-${theme} v2">
  ${style.background === "flat" ? "" : `<div id="bg"><div id="grid"></div>${style.background === "glow" ? '<div class="blob blob0"></div><div class="blob blob1"></div><div class="blob blob2"></div>' : ""}</div>`}
  <header class="chrome2"><div class="brand"><span class="dot"></span>${esc(script.title)}</div>${style.disclaimer === "corner" ? '<div class="ai">AI-generated · the source is the truth</div>' : ""}</header>
  <div id="progress"></div>
  ${sceneHtml.join("\n  ")}
  ${captionHtml.join("\n  ")}
  ${dockHtml}
  ${audioHtml.join("\n  ")}
  ${sfxHtml.join("\n  ")}
  <div id="wipe"></div>
</div>
<script>
  // A scene whose content is taller than its box is scaled down to fit, measured once it is visible.
  const fitted = new WeakSet();
  const fitScenes = () => {
    document.querySelectorAll(".scene").forEach((scene) => {
      const stack = scene.querySelector(".stack");
      if (!stack || fitted.has(stack) || scene.clientHeight === 0) return;
      fitted.add(stack);
      const room = scene.clientHeight - 40;
      if (stack.scrollHeight > room) stack.style.zoom = (room / stack.scrollHeight).toFixed(3);
    });
  };
  window.addEventListener("hf-seek", fitScenes);
  document.fonts.ready.then(fitScenes);
${emitWaapi()}
</script>
</body>
</html>
`;
await writeFile(join(out, "index.html"), html);
await writeFile(join(out, "timings.json"), JSON.stringify({ total, scenes: script.scenes.map(({ type, start, end }) => ({ type, start, end })) }, null, 2));
console.log(`built ${out} (${total}s, ${lines.length} lines, ${tweens.length} animations)`);
const limit = script.maxSeconds ?? (portrait ? 60 : 80);
if (total > limit) console.warn(`warning: ${total}s is over the ${limit}s target; cut lines or merge scenes`);

if (shouldRender) {
  const started = Date.now();
  const file = join(demoDir, `${script.slug ?? "video"}.mp4`);
  await run(hf, ["render", out, "-o", file, "-q", quality], { env, cwd: spike, maxBuffer: 64 * 1024 * 1024 });
  console.log(`rendered ${file} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
}
