import katex from "katex";
import texmath from "markdown-it-texmath";
import type { MathPlugin } from "./parse-markdown";

export const useMath: MathPlugin = (renderer) => {
  renderer.use(texmath, { engine: katex, delimiters: "dollars" });
};
