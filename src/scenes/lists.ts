import { esc } from "../text.ts";
import { staggered, type SceneContext, type SceneRenderer } from "./context.ts";

const NUMBER = /^\d+$/;

export const heading = (ctx: SceneContext, text: string) => {
  ctx.motion.reveal(`#${ctx.id} h2`, ctx.scene.start + 0.1);
  return `<h2>${ctx.rich(text, ctx.scene.start + 0.1)}</h2>`;
};

/** A number that counts up from zero when it is plain digits; shown as written otherwise. */
const countable = (ctx: SceneContext, sel: string, value: string, time: number) => {
  if (!NUMBER.test(value)) return esc(value);
  ctx.motion.count(sel, 0, Number(value), time, 0.8);
  return "0";
};

export const stats: SceneRenderer<"stats"> = (ctx, s) => {
  const times = staggered(s.items, ctx, 0.15);
  const items = s.items.map((it, i) => {
    ctx.motion.reveal(`#${ctx.id} .stat-${i}`, times[i]!, { opacity: 0, y: 60, scale: 0.9 }, "back.out", 0.5);
    return `<div class="stat stat-${i} tone-${it.tone ?? "plain"}"><div class="value">${countable(ctx, `#${ctx.id} .stat-${i} .value`, it.value, times[i]!)}</div><div class="label">${ctx.rich(it.label, times[i])}</div></div>`;
  });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="row">${items.join("")}</div></div>`;
};

const check = `<svg viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>`;

export const chips: SceneRenderer<"chips"> = (ctx, s) => {
  const times = staggered(s.items, ctx, 0.3, (it) => it.word);
  const items = s.items.map((it, i) => {
    ctx.motion.reveal(`#${ctx.id} .chip-${i}`, times[i]!, { opacity: 0, y: 30, scale: 0.8 }, "back.out", 0.4);
    return `<div class="chip chip-${i}">${check}<span>${esc(it.label)}</span></div>`;
  });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="chips">${items.join("")}</div></div>`;
};

export const checks: SceneRenderer<"checks"> = (ctx, s) => {
  const times = staggered(s.items, ctx, 0.2);
  const items = s.items.map((it, i) => {
    const time = times[i]!;
    ctx.motion.reveal(`#${ctx.id} .tile-${i}`, time, { opacity: 0, y: 40, scale: 0.9 }, "back.out", 0.45);
    if (it.sticker) ctx.motion.reveal(`#${ctx.id} .tile-${i} .sticker`, ctx.at(it.stickerAt ?? it.at) + 0.2, { opacity: 0, scale: 2.4, rotationTo: -6 }, "back.out", 0.3);
    return `<div class="tile tile-${i} tone-${it.tone ?? "plain"}"><div class="value${NUMBER.test(it.value) ? "" : " word"}">${countable(ctx, `#${ctx.id} .tile-${i} .value`, it.value, time)}</div><div class="label">${esc(it.label)}</div>${it.sticker ? `<div class="sticker">${esc(it.sticker)}</div>` : ""}</div>`;
  });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="tiles">${items.join("")}</div></div>`;
};

export const decisions: SceneRenderer<"decisions"> = (ctx, s) => {
  const times = staggered(s.items, ctx);
  const items = s.items.map((it, i) => {
    ctx.motion.reveal(`#${ctx.id} .dec-${i}`, times[i]!, { opacity: 0, x: -60 }, "power3.out", 0.45);
    return `<div class="dec dec-${i}"><div class="topic">${esc(it.topic)}</div><div class="after">${ctx.rich(it.after, times[i])}</div>${it.why ? `<div class="why">${esc(it.why)}</div>` : ""}</div>`;
  });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="decs">${items.join("")}</div></div>`;
};

export const todo: SceneRenderer<"todo"> = (ctx, s) => {
  const times = staggered(s.items, ctx);
  const items = s.items.map((it, i) => {
    ctx.motion.reveal(`#${ctx.id} .todo-${i}`, times[i]!, { opacity: 0, x: -40 }, "power3.out", 0.4);
    return `<div class="todo todo-${i}"><span class="box"></span><span>${esc(it.label)}</span>${it.tag ? `<span class="ttag mono">${esc(it.tag)}</span>` : ""}</div>`;
  });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="todos">${items.join("")}</div></div>`;
};

export const layers: SceneRenderer<"layers"> = (ctx, s) => {
  const times = staggered(s.items, ctx);
  const items = s.items.map((it, i) => {
    const time = times[i]!;
    ctx.motion.reveal(`#${ctx.id} .layer-${i}`, time, { opacity: 0, x: 80 }, "power3.out", 0.45);
    if (it.badge) ctx.motion.reveal(`#${ctx.id} .layer-${i} .lbadge`, time + 0.35, { opacity: 0, scale: 2.2 }, "back.out", 0.3);
    return `<div class="layer layer-${i}" style="margin-left:${i * 70}px"><span class="lnum lnum-${i % 3} mono">${i + 1}</span><div class="ltext"><div class="ltitle">${ctx.rich(it.title, time)}</div><div class="lwho">${esc(it.who)}</div></div>${it.badge ? `<span class="lbadge">${esc(it.badge)}</span>` : ""}</div>`;
  });
  if (s.caption) ctx.motion.reveal(`#${ctx.id} .caption`, ctx.at(s.captionAt) + 0.3, { opacity: 0, y: 16 });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="layers">${items.join("")}</div>${s.caption ? `<div class="caption">${ctx.rich(s.caption)}</div>` : ""}</div>`;
};

