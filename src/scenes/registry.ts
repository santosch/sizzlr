import type { SceneType } from "../script.ts";
import type { SceneRenderer } from "./context.ts";
import { chart } from "./chart.ts";
import { chain, code, diagram } from "./flow.ts";
import { checks, chips, decisions, layers, stats, todo } from "./lists.ts";
import { compare, custom, shot } from "./product.ts";
import { big, chapter, outro, punch, title } from "./text.ts";

/** Every catalogue element and the function that renders it; the type forces it to stay complete. */
export const renderers: { [T in SceneType]: SceneRenderer<T> } = {
  title,
  punch,
  big,
  chart,
  shot,
  compare,
  stats,
  chips,
  code,
  checks,
  decisions,
  todo,
  chain,
  layers,
  chapter,
  outro,
  diagram,
  custom,
};
