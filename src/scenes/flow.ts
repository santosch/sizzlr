import { esc } from "../text.ts";
import { staggered, type SceneRenderer } from "./context.ts";
import { heading } from "./lists.ts";

export const chain: SceneRenderer<"chain"> = (ctx, s) => {
  const times = staggered(s.nodes, ctx, 0.5);
  const parts = s.nodes.flatMap((n, i) => {
    const time = times[i]!;
    ctx.motion.reveal(`#${ctx.id} .node-${i}`, time, { opacity: 0, y: 24, scale: 0.85 }, "back.out", 0.4);
    const node = `<div class="node node-${i} tone-${n.tone ?? "plain"}">${n.kicker ? `<em class="mono">${esc(n.kicker)}</em>` : ""}${esc(n.label)}${n.note ? `<small>${esc(n.note)}</small>` : ""}</div>`;
    if (i === 0) return [node];
    ctx.motion.reveal(`#${ctx.id} .arrow-${i}`, time - 0.12, { opacity: 0, x: -14 }, "power2.out", 0.25);
    return [`<div class="arrow arrow-${i}">${ctx.portrait ? "↓" : "→"}</div>`, node];
  });
  if (s.caption) ctx.motion.reveal(`#${ctx.id} .caption`, ctx.at(s.captionAt) + 0.3, { opacity: 0, y: 16 });
  return `<div class="stack">${heading(ctx, s.heading)}<div class="chain">${parts.join("")}</div>${s.caption ? `<div class="caption">${ctx.rich(s.caption, ctx.at(s.captionAt) + 0.3)}</div>` : ""}</div>`;
};

/**
 * Mermaid source rendered in the page. The runtime draws it, then reveals each node when its
 * label is spoken (or in order across the scene when it never is).
 */
export const diagram: SceneRenderer<"diagram"> = (ctx, s) =>
  `<div class="stack">${s.heading ? heading(ctx, s.heading) : ""}<div class="diagram" data-scene="${ctx.id}"><pre class="mermaid-src">${esc(s.mermaid)}</pre></div></div>`;

export const code: SceneRenderer<"code"> = (ctx, s) => {
  ctx.motion.reveal(`#${ctx.id} .codecard`, s.start + 0.2, { opacity: 0, y: 40, scale: 0.97 });
  const times = staggered(s.code, ctx, 0.1);
  const rows = s.code.map((r, i) => {
    const time = times[i]!;
    ctx.motion.reveal(`#${ctx.id} .cl-${i}`, time, { opacity: 0, x: -20 }, "power2.out", 0.3);
    if (r.kind === "add") ctx.motion.keys(`#${ctx.id} .cl-${i} .flash`, [{ opacity: 0 }, { opacity: 0.9 }, { opacity: 0 }], time + 0.25, 0.8, "power2.out");
    const mark = { add: "+", del: "−", ctx: " " }[r.kind];
    return `<div class="cl cl-${i} k-${r.kind}"><span class="flash"></span><span class="sign">${mark}</span><span class="src">${esc(r.text)}</span></div>`;
  });
  const callouts = s.callouts ?? [];
  const calloutTimes = staggered(callouts, ctx, 0.3);
  callouts.forEach((_, i) => ctx.motion.reveal(`#${ctx.id} .callout-${i}`, calloutTimes[i]!, { opacity: 0, y: 20, scale: 0.9 }, "back.out", 0.4));
  return `<div class="stack">${heading(ctx, s.heading)}
    <div class="codecard"><div class="file mono">${esc(s.file)}</div><div class="code mono">${rows.join("")}</div></div>
    ${callouts.length ? `<div class="callouts">${callouts.map((c, i) => `<div class="callout callout-${i}">${esc(c.text)}</div>`).join("")}</div>` : ""}
  </div>`;
};
