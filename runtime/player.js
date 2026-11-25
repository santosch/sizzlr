// sizzlr page runtime. Turns the animation data in window.__SIZZLR__ into native Web Animations,
// draws counters and custom scenes from HyperFrames' seek time, and lays out Mermaid diagrams.
(() => {
  const data = window.__SIZZLR__;
  const hooks = window.__SIZZLR_RENDER__ || {};

  const EASE = {
    "power1.inOut": "cubic-bezier(0.45, 0, 0.55, 1)",
    "power2.out": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
    "power2.in": "cubic-bezier(0.55, 0.085, 0.68, 0.53)",
    "power2.inOut": "cubic-bezier(0.455, 0.03, 0.515, 0.955)",
    "power3.out": "cubic-bezier(0.215, 0.61, 0.355, 1)",
    "power4.out": "cubic-bezier(0.165, 0.84, 0.44, 1)",
    "power4.in": "cubic-bezier(0.895, 0.03, 0.685, 0.22)",
    "back.out": "cubic-bezier(0.34, 1.56, 0.64, 1)",
    "sine.inOut": "cubic-bezier(0.445, 0.05, 0.55, 0.95)",
    none: "linear",
  };
  const TRANSFORM_KEYS = ["x", "y", "scale", "scaleX", "scaleY", "rotation"];

  const frame = (p) => {
    const k = {};
    if ("opacity" in p) k.opacity = p.opacity;
    if (TRANSFORM_KEYS.some((key) => key in p)) {
      k.transform = `translate(${p.x ?? 0}px, ${p.y ?? 0}px) scale(${p.scaleX ?? p.scale ?? 1}, ${p.scaleY ?? p.scale ?? 1}) rotate(${p.rotation ?? 0}deg)`;
    }
    return k;
  };

  // Only an element's first animation fills backwards; a later one would otherwise override it from time 0.
  const started = new WeakSet();
  const play = (el, keyframes, { start, dur, ease = "none", repeat = 0, yoyo = false, fill }) => {
    const mode = fill ?? (started.has(el) || keyframes.length < 2 ? "forwards" : "both");
    if (!fill) started.add(el);
    const animation = el.animate(keyframes, {
      duration: dur * 1000,
      delay: start * 1000,
      easing: EASE[ease] ?? "linear",
      iterations: repeat + 1,
      direction: yoyo ? "alternate" : "normal",
      fill: mode,
    });
    animation.pause();
  };

  for (const t of data.tweens) {
    document.querySelectorAll(t.sel).forEach((el, i) => {
      const keyframes = t.keyframes ?? (t.from ? [frame(t.from), frame(t.to)] : [frame(t.to)]);
      play(el, keyframes, { ...t, start: t.start + (t.stagger ?? 0) * i });
    });
  }

  const EASE_FN = { "power2.out": (p) => 1 - (1 - p) ** 2, "power2.inOut": (p) => (p < 0.5 ? 2 * p * p : 1 - (-2 * p + 2) ** 2 / 2) };
  const drawCounters = (time) => {
    for (const c of data.counters) {
      const p = Math.min(1, Math.max(0, (time - c.start) / c.dur));
      const el = document.querySelector(c.sel);
      if (el) el.textContent = Math.round(c.from + (c.to - c.from) * EASE_FN[c.ease](p)).toLocaleString("en-US");
    }
  };

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

  const timeOf = (timing, at, word) => {
    const line = timing.lines[Math.min(at, timing.lines.length - 1)];
    if (!line) return timing.start + 0.3;
    if (word === undefined || word === null || Number.isNaN(word)) return line.words[0] ? line.words[0].at : line.start;
    const w = line.words[Math.min(word, line.words.length - 1)];
    return w ? w.at : line.start;
  };

  // Custom scenes: elements marked data-at (and data-word) appear as they are spoken.
  const ANIMS = {
    fade: [{ opacity: 0 }, { opacity: 1 }],
    slide: [frame({ opacity: 0, y: 28 }), frame({ opacity: 1, y: 0 })],
    pop: [frame({ opacity: 0, scale: 0.7 }), frame({ opacity: 1, scale: 1 })],
    draw: [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }],
  };
  for (const [id, timing] of Object.entries(data.timing)) {
    if (timing.type !== "custom") continue;
    document.querySelectorAll(`#${id} [data-at]`).forEach((el) => {
      const kind = el.dataset.anim in ANIMS ? el.dataset.anim : "slide";
      if (kind === "draw") el.setAttribute("pathLength", "1");
      play(el, ANIMS[kind], { start: timeOf(timing, Number(el.dataset.at), el.dataset.word === undefined ? undefined : Number(el.dataset.word)), dur: kind === "draw" ? 0.9 : 0.45, ease: kind === "pop" ? "back.out" : "power3.out" });
    });
  }

  const drawHooks = (time) => {
    for (const [id, fn] of Object.entries(hooks)) {
      const timing = data.timing[id];
      if (!timing || time < timing.start || time > timing.end) continue;
      fn(time - timing.start, document.getElementById(id));
    }
  };

  window.addEventListener("hf-seek", (e) => {
    fitScenes();
    drawCounters(e.detail.time);
    drawHooks(e.detail.time);
  });
  document.fonts.ready.then(fitScenes);
  drawCounters(0);

  // Diagrams: Mermaid draws them once, then each node appears when its label is spoken.
  if (!data.mermaid || !window.mermaid) return;
  const norm = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}]/gu, "");
  const c = data.mermaid.colors;
  window.mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "base",
    fontFamily: data.mermaid.font,
    flowchart: { htmlLabels: false, curve: "basis" },
    themeVariables: {
      fontFamily: data.mermaid.font,
      fontSize: "22px",
      background: "transparent",
      primaryColor: c.surface,
      primaryBorderColor: c.accent,
      primaryTextColor: c.ink,
      secondaryColor: c.surface,
      tertiaryColor: c.surface,
      lineColor: c.muted,
      textColor: c.ink,
      nodeBorder: c.accent,
      clusterBkg: c.surface,
      edgeLabelBackground: c.surface,
    },
  });

  const spokenTime = (timing, label, after) => {
    const keys = label.split(/\s+/).map(norm).filter((w) => w.length >= 3);
    for (const line of timing.lines) for (const w of line.words) if (w.at >= after && keys.includes(norm(w.w))) return w.at;
    return undefined;
  };

  const reveal = (svg, timing) => {
    const nodes = [...svg.querySelectorAll("g.node")];
    const span = Math.max(1, timing.end - timing.start - 1);
    const slot = (i, n) => timing.start + 0.4 + (span * i) / Math.max(1, n);
    const nodeTimes = new Map();
    let last = timing.start;
    nodes.forEach((node, i) => {
      const t = spokenTime(timing, node.textContent.trim(), timing.start) ?? Math.max(last, slot(i, nodes.length));
      last = t;
      const key = (node.id || "").replace(/^[a-z]+-/i, "").replace(/-\d+$/, "");
      nodeTimes.set(key, t);
      play(node, [{ opacity: 0 }, { opacity: 1 }], { start: t, dur: 0.35, ease: "power2.out" });
    });
    const edges = [...svg.querySelectorAll("path.flowchart-link, g.edgePaths path, path.transition, path.relationshipLine, line.messageLine0, line.messageLine1")];
    const labels = [...svg.querySelectorAll("g.edgeLabels g.edgeLabel, text.messageText")];
    edges.forEach((edge, i) => {
      const ends = [...edge.classList].filter((cls) => /^L[SE]-/.test(cls)).map((cls) => nodeTimes.get(cls.slice(3)));
      const t = ends.length === 2 && ends.every((v) => v !== undefined) ? Math.max(...ends) + 0.15 : slot(i + 0.5, edges.length);
      edge.setAttribute("pathLength", "1");
      edge.style.strokeDasharray = "1";
      play(edge, [{ strokeDashoffset: 1, opacity: 0 }, { strokeDashoffset: 1, opacity: 1, offset: 0.05 }, { strokeDashoffset: 0, opacity: 1 }], { start: t, dur: 0.6, ease: "power2.out" });
      if (labels[i]) play(labels[i], [{ opacity: 0 }, { opacity: 1 }], { start: t + 0.3, dur: 0.3 });
    });
    if (nodes.length === 0 && edges.length === 0) {
      const parts = [...svg.querySelectorAll("g.actor, rect.actor, text.actor, g.entity, g.mindmap-node")];
      parts.forEach((part, i) => play(part, [{ opacity: 0 }, { opacity: 1 }], { start: slot(i, parts.length), dur: 0.35 }));
    }
  };

  const ready = (async () => {
    for (const host of document.querySelectorAll(".diagram")) {
      const id = host.dataset.scene;
      const source = host.querySelector(".mermaid-src").textContent;
      const { svg } = await window.mermaid.render(`mmd-${id}`, source);
      host.innerHTML = svg;
      reveal(host.querySelector("svg"), data.timing[id]);
    }
  })();
  window.__hf = window.__hf || {};
  window.__hf.buildReady = window.__hf.buildReady || {};
  window.__hf.buildReady.sizzlrDiagrams = ready;
})();
