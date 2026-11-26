import type { ParsedMarkdown } from "./parse-markdown";

declare const __MID_RENDER_REVISION__: string;
const revision = typeof __MID_RENDER_REVISION__ === "string" ? __MID_RENDER_REVISION__ : "dev";
const MAX_BYTES = 16 * 1024 * 1024;
const MAX_ENTRIES = 32;

interface Entry {
  key: string;
  bytes: number;
  usedAt: number;
  parsed: ParsedMarkdown;
}

let database: Promise<IDBDatabase | undefined> | undefined;

function openCache(): Promise<IDBDatabase | undefined> {
  return database ??= new Promise((resolve) => {
    const request = indexedDB.open("mid-render-cache", 1);
    request.onupgradeneeded = () => {
      request.result.createObjectStore("documents", { keyPath: "key" });
      request.result.createObjectStore("usage", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = request.onblocked = () => resolve(undefined);
  });
}

export async function cacheKey(markdown: string): Promise<string | undefined> {
  if (typeof indexedDB === "undefined" || !globalThis.crypto?.subtle || revision === "dev") return;
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(markdown));
  return revision + ":" + Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function readCachedMarkdown(key: string): Promise<ParsedMarkdown | undefined> {
  const db = await openCache();
  if (!db) return;
  return new Promise((resolve) => {
    const tx = db.transaction(["documents", "usage"], "readwrite");
    const request = tx.objectStore("documents").get(key);
    request.onsuccess = () => {
      const entry = request.result as Entry | undefined;
      if (entry && typeof entry.parsed?.raw === "string") {
        tx.objectStore("usage").put({ key, bytes: entry.bytes, usedAt: Date.now() });
        resolve(entry.parsed);
      } else resolve(undefined);
    };
    request.onerror = tx.onabort = () => resolve(undefined);
  });
}

export async function writeCachedMarkdown(key: string, parsed: ParsedMarkdown): Promise<void> {
  const bytes = JSON.stringify(parsed).length * 2;
  if (bytes > MAX_BYTES / 2) return;
  const db = await openCache();
  if (!db) return;

  const tx = db.transaction(["documents", "usage"], "readwrite");
  const documents = tx.objectStore("documents");
  const usage = tx.objectStore("usage");
  const usedAt = Date.now();
  documents.put({ key, bytes, usedAt, parsed });
  usage.put({ key, bytes, usedAt });
  const request = usage.getAll();
  request.onsuccess = () => {
    const entries = (request.result as Omit<Entry, "parsed">[])
      .sort((a, b) => b.usedAt - a.usedAt);
    let total = 0;
    entries.forEach((entry, index) => {
      total += entry.bytes;
      if (!entry.key.startsWith(revision + ":") || total > MAX_BYTES || index >= MAX_ENTRIES) {
        documents.delete(entry.key);
        usage.delete(entry.key);
        total -= entry.bytes;
      }
    });
  };
}
