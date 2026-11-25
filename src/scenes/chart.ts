import { scaleLinear, scalePoint } from "d3-scale";
import { area, curveMonotoneX, line } from "d3-shape";
import type { SceneOf } from "../script.ts";
import { esc, sum } from "../text.ts";
import { staggered, type SceneContext, type SceneRenderer, type TimedSceneOf } from "./context.ts";
import { heading } from "./lists.ts";

/** The chart area in pixels, so the SVG maps 1:1 onto it and nothing is stretched. */
const plotSize = (portrait: boolean) => (portrait ? { width: 830, height: 760 } : { width: 1510, height: 440 });

/** A tick step that gives four to six gridlines. */
export const niceStep = (max: number) => {
  const pow = 10 ** Math.floor(Math.log10(max / 5));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((step) => max / step <= 6) ?? pow * 10;
};

const format = (v: number, unit?: string) => `${Number(v.toFixed(2)).toLocaleString("en-US")}${unit ? ` ${unit}` : ""}`;

const toneOf = (s: SceneOf<"chart">, ci: number, vi: number) => s.categories[ci]?.tones?.[vi] ?? s.series?.[vi]?.tone ?? "plain";

const chartMax = (s: SceneOf<"chart">) => {
  const totals = s.categories.map((c) => (s.stack ? sum(c.values) : Math.max(...c.values)));
  return s.max ?? Math.max(...totals, s.limit?.value ?? 0) * 1.12;
};

const legend = (s: SceneOf<"chart">) =>
  (s.series?.length ?? 0) > 1 ? `<div class="legend">${s.series!.map((se) => `<span class="lg tone-${se.tone ?? "plain"}"><i></i>${esc(se.name)}</span>`).join("")}</div>` : "";

const frame = (ctx: SceneContext, s: TimedSceneOf<"chart">, max: number, plot: string) => {
  const step = niceStep(max);
  const ticks = Array.from({ length: Math.floor(max / step) + 1 }, (_, i) => i * step);
  const pct = (v: number) => ((v / max) * 100).toFixed(2);
  ctx.motion.reveal(`#${ctx.id} .axis`, s.start + 0.2, { opacity: 0 }, "none", 0.4);
  if ((s.series?.length ?? 0) > 1) ctx.motion.reveal(`#${ctx.id} .legend`, s.start + 0.25);
  let limit = "";
  if (s.limit) {
    const lt = ctx.at(s.limit.at);
    ctx.motion.tween(`#${ctx.id} .limit`, { scaleX: 0 }, { scaleX: 1 }, lt, 0.6, "power3.out");
    ctx.motion.reveal(`#${ctx.id} .limit .ltag`, lt + 0.4, { opacity: 0, x: 20 });
    limit = `<div class="limit" style="bottom:${pct(s.limit.value)}%"><span class="ltag">${esc(s.limit.label)}</span></div>`;
  }
  if (s.note) ctx.motion.reveal(`#${ctx.id} .cnote`, ctx.at(s.note.at) + 0.2, { opacity: 0, scale: 1.6, rotationTo: -2 }, "back.out", 0.35);
  return `<div class="stack">
    <div class="chead">${heading(ctx, s.heading)}${legend(s)}</div>
    <div class="chart kind-${s.kind}">
      <div class="axis">${ticks.map((v) => `<div class="tick" style="bottom:${pct(v)}%"><span>${esc(format(v, s.unit))}</span></div>`).join("")}</div>
      ${plot}${limit}
      ${s.note ? `<div class="cnote">${ctx.rich(s.note.text)}</div>` : ""}
    </div>
  </div>`;
};

const bars = (ctx: SceneContext, s: TimedSceneOf<"chart">, max: number) => {
  const pct = (v: number) => ((v / max) * 100).toFixed(2);
  const times = staggered(s.categories, ctx, s.stagger ?? 0.12);
  const cats = s.categories.map((c, ci) => {
    const time = times[ci]!;
    ctx.motion.reveal(`#${ctx.id} .cat-${ci} .clabel`, time, { opacity: 0, y: 12 });
    let base = 0;
    const segments = c.values.map((v, vi) => {
      const t = time + (s.stack ? vi * 0.55 : vi * 0.35);
      ctx.motion.tween(`#${ctx.id} .cat-${ci} .b-${vi} .fill`, { scaleY: 0 }, { scaleY: 1 }, t, s.stack ? 0.55 : 0.8, "power3.out");
      ctx.motion.reveal(`#${ctx.id} .cat-${ci} .b-${vi} .val`, t + 0.45, { opacity: 0, y: 10 }, "power3.out", 0.3);
      const label = esc(c.labels?.[vi] ?? format(v, s.unit));
      const html = s.stack
        ? `<div class="bar seg b-${vi} tone-${toneOf(s, ci, vi)}" style="bottom:${pct(base)}%;height:${pct(v)}%"><div class="fill" style="height:100%"></div><div class="val">${label}</div></div>`
        : `<div class="bar b-${vi} tone-${toneOf(s, ci, vi)}"><div class="fill" style="height:${pct(v)}%"></div><div class="val" style="bottom:calc(${pct(v)}% + 8px)">${label}</div></div>`;
      base += v;
      return html;
    });
    return `<div class="cat cat-${ci}"><div class="bars${s.stack ? " stacked" : ""}">${segments.join("")}</div><div class="clabel">${esc(c.label)}</div></div>`;
  });
  return `<div class="plot">${cats.join("")}</div>`;
};

/** Lines (or areas) drawn left to right as their categories are spoken; one path per series. */
const lines = (ctx: SceneContext, s: TimedSceneOf<"chart">, max: number) => {
  const PLOT = plotSize(ctx.portrait);
  const x = scalePoint<number>()
    .domain(s.categories.map((_, i) => i))
    .range([60, PLOT.width - 60]);
  const y = scaleLinear().domain([0, max]).range([PLOT.height, 0]);
  const seriesCount = Math.max(...s.categories.map((c) => c.values.length));
  const times = staggered(s.categories, ctx, s.stagger ?? 0.25);
  const first = times[0]!;
  const span = Math.max(0.6, times.at(-1)! - first + 0.4);
  const paths = Array.from({ length: seriesCount }, (_, si) => {
    const points = s.categories.map((c, ci): [number, number] => [x(ci)!, y(c.values[si] ?? 0)]);
    const tone = s.series?.[si]?.tone ?? (si === 0 ? "accent" : "plain");
    const stroke = line().curve(curveMonotoneX)(points) ?? "";
    ctx.motion.keys(`#${ctx.id} .ln-${si}`, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], first, span, "power1.inOut");
    const fill = s.kind === "area" ? `<path class="ar ar-${si} tone-${tone}" d="${area().curve(curveMonotoneX).y0(PLOT.height)(points) ?? ""}"/>` : "";
    if (fill) ctx.motion.reveal(`#${ctx.id} .ar-${si}`, first + span * 0.6, { opacity: 0 }, "power2.out", 0.6);
    const dots = points
      .map(([px, py], ci) => {
        ctx.motion.reveal(`#${ctx.id} .dot-${si}-${ci}`, times[ci]!, { opacity: 0, scale: 0.2 }, "back.out", 0.3);
        // Long series label only their last point, unless the script gives a label.
        const given = s.categories[ci]?.labels?.[si];
        const label = given ?? (s.categories.length <= 4 || ci === s.categories.length - 1 ? format(s.categories[ci]?.values[si] ?? 0, s.unit) : "");
        const text = label ? `<text x="${px}" y="${py - 22}">${esc(label)}</text>` : "";
        return `<g class="dot dot-${si}-${ci} tone-${tone}" style="transform-origin:${px}px ${py}px"><circle cx="${px}" cy="${py}" r="9"/>${text}</g>`;
      })
      .join("");
    return `${fill}<path class="ln ln-${si} tone-${tone}" d="${stroke}" pathLength="1"/>${dots}`;
  });
  s.categories.forEach((_, ci) => ctx.motion.reveal(`#${ctx.id} .xl-${ci}`, times[ci]!, { opacity: 0, y: 10 }));
  const xLabels = s.categories.map((c, ci) => `<span class="xl xl-${ci}" style="left:${((x(ci)! / PLOT.width) * 100).toFixed(2)}%">${esc(c.label)}</span>`).join("");
  return `<svg class="lines" viewBox="0 0 ${PLOT.width} ${PLOT.height}" preserveAspectRatio="none">${paths.join("")}</svg><div class="xlabels">${xLabels}</div>`;
};

export const chart: SceneRenderer<"chart"> = (ctx, s) => {
  const max = chartMax(s);
  return frame(ctx, s, max, s.kind === "bar" ? bars(ctx, s, max) : lines(ctx, s, max));
};
