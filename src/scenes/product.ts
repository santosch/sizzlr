import { readFile } from "node:fs/promises";
import { match } from "ts-pattern";
import { esc } from "../text.ts";
import { staggered, type SceneRenderer } from "./context.ts";
import { heading } from "./lists.ts";

const cursorSvg = `<svg viewBox="0 0 24 24" width="30" height="30"><path d="M4 2l15 9.5-6.6 1.3 3.9 7.2-3 1.6-3.9-7.3L4 19z" fill="#18181b" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>`;

/** Width and height of a PNG or JPEG, read from its header. */
export const imageSize = async (file: string) => {
  const b = await readFile(file);
  if (b.readUInt32BE(0) === 0x89504e47) return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) };
  for (let i = 2; i < b.length - 9; ) {
    if (b[i] !== 0xff) throw new Error(`${file}: not a PNG or JPEG`);
    const marker = b[i + 1]!;
    if (marker >= 0xc0 && marker <= 0xc3) return { w: b.readUInt16BE(i + 7), h: b.readUInt16BE(i + 5) };
    i += 2 + b.readUInt16BE(i + 2);
  }
  throw new Error(`${file}: not a PNG or JPEG`);
};

/** A real screenshot in a browser frame; the camera zooms to each focus region in turn. */
export const shot: SceneRenderer<"shot"> = async (ctx, s) => {
  const file = await ctx.asset(s.image);
  const { w, h } = await imageSize(file.source);
  const viewW = ctx.portrait ? 980 : 1560;
  const imgH = viewW * (h / w);
  const viewH = Math.round(Math.min(imgH, ctx.portrait ? 1100 : 600));
  ctx.motion.reveal(`#${ctx.id} .frame`, s.start + 0.05, { opacity: 0, y: 60, scale: 0.94 }, "power3.out", 0.6);
  const boxes = s.focus.map((f, fi) => {
    const time = ctx.at(f.at, f.word);
    const scale = Math.min(f.zoom ?? 2.4, 0.86 / Math.max(f.w, (f.h * imgH) / viewH));
    const cx = (f.x + f.w / 2) * viewW;
    const cy = (f.y + f.h / 2) * imgH;
    const x = Math.min(0, Math.max(viewW - viewW * scale, viewW / 2 - cx * scale));
    const y = Math.min(0, Math.max(viewH - imgH * scale, viewH / 2 - cy * scale));
    ctx.motion.tween(`#${ctx.id} .cam`, undefined, { x, y, scale }, time - 0.15, 0.9, "power2.inOut");
    ctx.motion.reveal(`#${ctx.id} .hl-${fi}`, time + 0.45, { opacity: 0, scale: 1.08 }, "power3.out", 0.35);
    ctx.motion.reveal(`#${ctx.id} .hl-${fi} .btag`, time + 0.6, { opacity: 0, y: 10 }, "back.out", 0.3);
    if (fi > 0) ctx.motion.tween(`#${ctx.id} .hl-${fi - 1}`, undefined, { opacity: 0 }, time - 0.1, 0.25, "power1.inOut");
    ctx.motion.tween(`#${ctx.id} .cursor`, undefined, { x: (f.x + f.w * 0.82) * viewW, y: (f.y + f.h * 0.75) * imgH, opacity: 1 }, time - 0.1, 0.7, "power2.inOut");
    ctx.motion.keys(`#${ctx.id} .cursor i`, [{ transform: "scale(0)", opacity: 0.9 }, { transform: "scale(1.6)", opacity: 0 }], time + 0.62, 0.5, "power2.out");
    return `<div class="hl hl-${fi} tone-${f.tone ?? "accent"}" style="--s:${scale.toFixed(3)};left:${(f.x * 100).toFixed(2)}%;top:${(f.y * 100).toFixed(2)}%;width:${(f.w * 100).toFixed(2)}%;height:${(f.h * 100).toFixed(2)}%">${f.label ? `<span class="btag">${esc(f.label)}</span>` : ""}</div>`;
  });
  if (s.zoomOutAt !== undefined) {
    const back = ctx.at(s.zoomOutAt);
    ctx.motion.tween(`#${ctx.id} .cam`, undefined, { x: 0, y: 0, scale: 1 }, back - 0.1, 0.8, "power2.inOut");
    ctx.motion.tween(`#${ctx.id} .hl`, undefined, { opacity: 0 }, back - 0.1, 0.3, "power1.inOut");
  }
  return `<div class="stack center shotstack">
    ${s.heading ? heading(ctx, s.heading) : ""}
    <div class="frame" style="width:${viewW}px">
      <div class="chromebar"><i></i><i></i><i></i><span class="url mono">${esc(s.url ?? "")}</span></div>
      <div class="viewport" style="height:${viewH}px">
        <div class="cam" style="width:${viewW}px;height:${imgH}px">
          <img src="${file.path}" style="width:${viewW}px;height:${imgH}px" alt="" />
          ${boxes.join("")}
          <div class="cursor" style="opacity:0">${cursorSvg}<i></i></div>
        </div>
      </div>
    </div>
  </div>`;
};

type Block = Parameters<SceneRenderer<"compare">>[1]["panels"][number]["blocks"][number];

const block = (b: Block) =>
  match(b)
    .with({ kind: "page" }, (p) => `<div class="mrow"><div class="mpage" style="font-size:${p.size}px">${esc(p.text)}</div>${p.annot ? `<span class="annot">${esc(p.annot)}</span>` : ""}</div>`)
    .with(
      { kind: "card" },
      (c) =>
        `<div class="mcard"><div class="mrow"><div class="mctitle${c.custom ? " custom" : ""}" style="font-size:${c.size}px">${esc(c.text)}</div>${c.annot ? `<span class="annot${c.custom ? " bad" : ""}">${esc(c.annot)}</span>` : ""}</div>${Array.from({ length: c.lines ?? 2 }, (_, i) => `<i style="width:${88 - i * 22}%"></i>`).join("")}</div>`,
    )
    .with({ kind: "text" }, (t) => `<div class="mtext">${esc(t.text)}</div>`)
    .with({ kind: "button" }, (btn) => `<span class="mbtn${btn.primary ? " primary" : ""}">${esc(btn.text)}</span>`)
    .exhaustive();

/** UI illustrations side by side, each with a verdict stamp that can change during the scene. */
export const compare: SceneRenderer<"compare"> = (ctx, s) => {
  const times = staggered(s.panels, ctx, 0.25);
  const panels = s.panels.map((p, pi) => {
    ctx.motion.reveal(`#${ctx.id} .panel-${pi}`, times[pi]!, { opacity: 0, y: 50, scale: 0.94 }, "back.out", 0.5);
    const verdicts = (p.verdicts ?? []).map((v, vi) => {
      const time = ctx.at(v.at) + 0.3;
      ctx.motion.reveal(`#${ctx.id} .panel-${pi} .verdict-${vi}`, time, { opacity: 0, scale: 2.6, rotationTo: -6 }, "power4.in", 0.22);
      if (vi > 0) ctx.motion.tween(`#${ctx.id} .panel-${pi} .verdict-${vi - 1}`, undefined, { opacity: 0, scale: 0.8 }, time - 0.05, 0.15, "power2.in");
      return `<span class="verdict verdict-${vi} tone-${v.tone}">${esc(v.text)}</span>`;
    });
    return `<div class="panel panel-${pi}"><div class="plabel">${esc(p.label)}</div><div class="mockwin"><div class="mock">${p.blocks.map(block).join("")}</div>${verdicts.join("")}</div></div>`;
  });
  return `<div class="stack"><div class="chead">${heading(ctx, s.heading)}<span class="illu mono">Illustration · shown at 2×</span></div><div class="panels">${panels.join("")}</div></div>`;
};

/** The agent's own markup; the runtime reveals `data-at` elements and calls `render(t)`. */
export const custom: SceneRenderer<"custom"> = (ctx, s) => `<div class="stack custom-root">${s.html}</div>`;
