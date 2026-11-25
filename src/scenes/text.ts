import { esc, markedWords, normalizeWord } from "../text.ts";
import type { SceneRenderer } from "./context.ts";

/** Words of a display line rising in one after another. */
const displayWords = (ctx: Parameters<SceneRenderer<"title">>[0], text: string, start: number, cls: string) => {
  const words = markedWords(text);
  words.forEach((_, i) => ctx.motion.reveal(`#${ctx.id} .${cls} .w${i}`, start + i * 0.07, { opacity: 0, y: 50 }, "power4.out", 0.5));
  return words.map((w, i) => `<span class="tw w${i}">${ctx.word(w, start + 0.4)}</span>`).join(" ");
};

export const title: SceneRenderer<"title"> = (ctx, s) => {
  if (s.kicker) ctx.motion.reveal(`#${ctx.id} .kicker`, s.start + 0.1, { opacity: 0, y: 16 });
  if (s.subtitle) ctx.motion.reveal(`#${ctx.id} .subtitle`, ctx.at(1));
  return `<div class="stack center">
    ${s.kicker ? `<div class="kicker mono">${esc(s.kicker)}</div>` : ""}
    <h1 class="display">${displayWords(ctx, s.title, s.start + 0.18, "display")}</h1>
    ${s.subtitle ? `<div class="subtitle">${ctx.rich(s.subtitle, ctx.at(1))}</div>` : ""}
  </div>`;
};

/** Big words that land as they are spoken: each one on the next spoken word with the same letters. */
export const punch: SceneRenderer<"punch"> = (ctx, s) => {
  const li = s.line ?? 0;
  const spoken = s.lines[li]?.words ?? [];
  const words = markedWords(s.text);
  let cursor = 0;
  const times = words.map((w, i) => {
    if (spoken.length === 0) return s.start + 0.2 + i * 0.12;
    const found = spoken.findIndex((sw, k) => k >= cursor && normalizeWord(sw.w) === normalizeWord(w.w));
    const k = found === -1 ? Math.min(cursor, spoken.length - 1) : found;
    cursor = k + 1;
    return spoken[k]!.at;
  });
  times.forEach((t, i) => ctx.motion.reveal(`#${ctx.id} .pw${i}`, t - 0.05, { opacity: 0, scale: 1.9, y: -10 }, "power4.out", 0.28));
  if (s.sub) ctx.motion.reveal(`#${ctx.id} .psub`, ctx.at(s.subAt ?? li + 1));
  const html = words.map((w, i) => `<span class="pw pw${i}">${ctx.word(w, times[i])}</span>`).join(" ");
  return `<div class="stack center"><div class="punch tone-${s.tone ?? "plain"}">${html}</div>${s.sub ? `<div class="psub">${ctx.rich(s.sub, ctx.at(s.subAt ?? li + 1))}</div>` : ""}</div>`;
};

export const big: SceneRenderer<"big"> = (ctx, s) => {
  const time = ctx.at(s.at);
  if (s.kicker) ctx.motion.reveal(`#${ctx.id} .kicker`, s.start + 0.1);
  ctx.motion.reveal(`#${ctx.id} .bignum`, time, { opacity: 0, scale: 0.5 }, "back.out", 0.5);
  const counts = s.countFrom !== undefined && typeof s.value === "number";
  if (counts) ctx.motion.count(`#${ctx.id} .bignum .v`, s.countFrom!, s.value as number, time, s.countDuration ?? 1.1, "power2.inOut");
  if (s.label) ctx.motion.reveal(`#${ctx.id} .biglabel`, time + 0.35);
  if (s.footnote) ctx.motion.reveal(`#${ctx.id} .footnote`, ctx.at(s.footnoteAt ?? s.at) + 0.2);
  const shown = counts ? s.countFrom!.toLocaleString("en-US") : typeof s.value === "number" ? s.value.toLocaleString("en-US") : s.value;
  const wordy = String(s.value).length > 7;
  return `<div class="stack center">
    ${s.kicker ? `<div class="kicker mono">${esc(s.kicker)}</div>` : ""}
    <div class="bignum tone-${s.tone ?? "plain"}${wordy ? " wordy" : ""}">${s.prefix ? `<span class="affix">${esc(s.prefix)}</span>` : ""}<span class="v">${esc(shown)}</span>${s.suffix ? `<span class="affix">${esc(s.suffix)}</span>` : ""}</div>
    ${s.label ? `<div class="biglabel">${ctx.rich(s.label, time + 0.35)}</div>` : ""}
    ${s.footnote ? `<div class="footnote mono">${esc(s.footnote)}</div>` : ""}
  </div>`;
};

/** A contents card: every chapter of the video, the current one highlighted. */
export const chapter: SceneRenderer<"chapter"> = (ctx, s) => {
  const chapters = ctx.script.scenes.flatMap((x) => (x.type === "chapter" ? [x.title] : []));
  const n = chapters.indexOf(s.title);
  ctx.motion.reveal(`#${ctx.id} .chnum`, s.start + 0.05, { opacity: 0, y: 30 }, "power4.out", 0.4);
  ctx.motion.reveal(`#${ctx.id} .chtitle`, s.start + 0.12, { opacity: 0, y: 40 }, "power4.out", 0.45);
  chapters.forEach((_, i) => ctx.motion.reveal(`#${ctx.id} .toc-${i}`, s.start + 0.1 + i * 0.05, { opacity: 0, x: 30 }, "power3.out", 0.35));
  const state = (i: number) => (i === n ? " now" : i < n ? " done" : "");
  return `<div class="stack chapterstack">
    <div class="chleft"><div class="chnum mono">Chapter ${n + 1} of ${chapters.length}</div><div class="chtitle">${ctx.rich(s.title, s.start + 0.3)}</div></div>
    <ol class="toc">${chapters.map((c, i) => `<li class="toc-${i}${state(i)}"><span class="mono">${i + 1}</span>${esc(c.replace(/==/g, ""))}</li>`).join("")}</ol>
  </div>`;
};

export const outro: SceneRenderer<"outro"> = (ctx, s) => {
  if (s.subtitle) ctx.motion.reveal(`#${ctx.id} .subtitle`, s.start + 0.4);
  const last = s.lines.at(-1);
  if (s.stamp && last) ctx.motion.reveal(`#${ctx.id} .stamp`, last.start + last.speechEnd + 0.05, { opacity: 0, scale: 3.2, rotationTo: -8 }, "power4.in", 0.25);
  const note =
    ctx.config.style.disclaimer === "outro" ? `<div class="disclaimer">AI-generated${ctx.script.source ? ` from ${esc(ctx.script.source)}` : ""}. The source is the truth.</div>` : "";
  if (note) ctx.motion.reveal(`#${ctx.id} .disclaimer`, s.start + 0.6, { opacity: 0 }, "none", 0.4);
  return `<div class="stack center">
    <h1 class="display">${displayWords(ctx, s.title, s.start + 0.1, "display")}</h1>
    ${s.subtitle ? `<div class="subtitle mono">${esc(s.subtitle)}</div>` : ""}
    ${s.stamp ? `<div class="stamp">${esc(s.stamp)}</div>` : ""}
    ${note}
  </div>`;
};
