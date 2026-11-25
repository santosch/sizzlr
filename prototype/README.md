# Prototype

The spike that proved the idea, kept as the reference for the real package described in
`../PLAN.md`. One script, no types, no tests; expect rough edges.

## Run it

```bash
npm install hyperframes@0.9.91 geist        # in the parent folder of prototype/
pip install kokoro-onnx soundfile           # local voices; the model downloads on first use
# FFmpeg and Chrome must be installed; `npx hyperframes doctor` checks both

node build.mjs examples/sizzlr-intro                  # voices + HyperFrames project, prints the length
DO_NOT_TRACK=1 ../node_modules/.bin/hyperframes snapshot examples/sizzlr-intro/project --at 3,12,20
node build.mjs examples/sizzlr-intro --render         # MP4 next to script.json (draft quality)
```

Options: `--config other.config.json`, `--quality standard`.

## Files

- `build.mjs`: the whole pipeline: voices with cache and silence trimming, word timing, scenes,
  captions, speakers, sound effects, Web Animations, render.
- `base.css`, `v2.css`, `v3.css`, `format-portrait.css`, `v2-portrait.css`: layout; colours come
  from the config.
- `sizzlr.config.json`: fonts, colours, voices, style switches.
- `sfx/`: sound effects synthesised with FFmpeg.
- `SKILL.md`: what an agent follows to write `script.json`, including the element catalogue.
- `examples/sizzlr-intro/script.json`: a neutral example.
