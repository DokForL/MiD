import { mayContainMath } from "./document-info";
import type { RenderResult } from "./finalize-markdown";
import type { ParsedMarkdown } from "./parse-markdown";

const WORKER_IDLE_MS = 20_000;
let worker: Worker | undefined;
let idleTimer: ReturnType<typeof setTimeout> | undefined;
let requestId = 0;
let parseQueue = Promise.resolve();
const pending = new Map<number, (result?: ParsedMarkdown) => void>();

function stopWorker() {
  clearTimeout(idleTimer);
  worker?.terminate();
  worker = undefined;
  for (const resolve of pending.values()) resolve();
  pending.clear();
}

function startWorker(): Worker {
  const instance = new Worker(new URL("./markdown.worker.ts", import.meta.url), { type: "module" });
  instance.onerror = instance.onmessageerror = () => {
    if (instance === worker) stopWorker();
  };
  instance.onmessage = ({ data }: MessageEvent<{ id: number; result?: ParsedMarkdown }>) => {
    pending.get(data.id)?.(data.result);
    pending.delete(data.id);
    if (!pending.size) idleTimer = setTimeout(stopWorker, WORKER_IDLE_MS);
  };
  return instance;
}

function sendToWorker(markdown: string, math: boolean): Promise<ParsedMarkdown | undefined> {
  if (typeof Worker === "undefined") return Promise.resolve(undefined);
  return new Promise((resolve) => {
    clearTimeout(idleTimer);
    const id = ++requestId;
    const deadline = setTimeout(stopWorker, 30_000);
    const finish = (parsed?: ParsedMarkdown) => {
      clearTimeout(deadline);
      resolve(parsed);
    };
    try {
      worker ??= startWorker();
      pending.set(id, finish);
      worker.postMessage({ id, markdown, math });
    } catch {
      stopWorker();
      finish();
    }
  });
}

function parseInWorker(markdown: string, math: boolean, signal?: AbortSignal): Promise<ParsedMarkdown | undefined> {
  const request = parseQueue.then(() => {
    signal?.throwIfAborted();
    return sendToWorker(markdown, math);
  });
  parseQueue = request.then(() => {}, () => {});
  return request;
}

function benefitsFromWorker(markdown: string): boolean {
  if (markdown.length >= 64 * 1024) return true;
  let fences = 0;
  for (const _ of markdown.matchAll(/^ {0,3}[\x60~]{3}/gm)) {
    if (++fences === 16) return true;
  }
  return false;
}

export async function renderDocument(
  markdown: string,
  baseDir?: string,
  cacheOnDisk = false,
  signal?: AbortSignal,
): Promise<RenderResult> {
  signal?.throwIfAborted();
  const math = mayContainMath(markdown);
  const dependencies = Promise.all([
    import("./finalize-markdown"),
    math ? import("katex/dist/katex.min.css") : undefined,
  ]);
  // A canceled render may never reach the join below.
  void dependencies.catch(() => {});
  const useWorker = benefitsFromWorker(markdown);
  const cache = useWorker && cacheOnDisk ? await import("./render-cache") : undefined;
  const key = await cache?.cacheKey(markdown).catch(() => undefined);
  let parsed = key ? await cache?.readCachedMarkdown(key).catch(() => undefined) : undefined;
  const cacheHit = !!parsed;
  signal?.throwIfAborted();
  if (!parsed && useWorker) parsed = await parseInWorker(markdown, math, signal);
  signal?.throwIfAborted();
  if (!parsed) {
    const [{ parseMarkdown }, plugin] = await Promise.all([
      import("./parse-markdown"),
      math ? import("./math-markdown") : undefined,
    ]);
    signal?.throwIfAborted();
    parsed = parseMarkdown(markdown, plugin?.useMath);
  }
  const [{ finalizeMarkdown }] = await dependencies;
  signal?.throwIfAborted();
  if (key && parsed && !cacheHit) void cache?.writeCachedMarkdown(key, parsed).catch(() => {});
  return finalizeMarkdown(parsed, baseDir, true);
}
