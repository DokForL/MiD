import { parseMarkdown } from "./parse-markdown";

self.onmessage = async ({ data }: MessageEvent<{ id: number; markdown: string; math: boolean }>) => {
  try {
    const plugin = data.math ? (await import("./math-markdown")).useMath : undefined;
    self.postMessage({ id: data.id, result: parseMarkdown(data.markdown, plugin) });
  } catch {
    self.postMessage({ id: data.id });
  }
};
