import DOMPurify from "dompurify";
import { convertFileSrc } from "@tauri-apps/api/core";
import { resolveLocalPath } from "./document-info";
import type { ParsedMarkdown } from "./parse-markdown";

export interface RenderResult {
  html: string;
  frontmatter: Record<string, unknown> | null;
  wordCount: number;
  /**
   * Absolute on-disk paths of every local image the document references, after
   * resolution against `baseDir`. The caller hands these to the `allow_assets`
   * command, which is the only way a file becomes fetchable by the webview's
   * asset protocol (issue #31) — and which serves only files inside the
   * document's own folder tree or a pinned folder, whatever this list says.
   */
  assetPaths: string[];
  /** True when the frontmatter declares `marp: true` — a Marp slide deck (#44). */
  isMarp: boolean;
}

export function finalizeMarkdown(
  { raw, frontmatter, wordCount, isMarp }: ParsedMarkdown,
  baseDir?: string,
  deferImages = false,
): RenderResult {
  let earlyImages = 0;
  const markup = deferImages ? raw.replace(/<img\b[^>]*>/gi, (tag, offset: number) => {
    if (offset < 4096 && ++earlyImages <= 2) return tag;
    return tag.replace(/^<img/i, '<img loading="lazy" decoding="async"');
  }) : raw;
  let html = DOMPurify.sanitize(markup, {
    ADD_TAGS: [
      "pre", "code", "math", "mrow", "mi", "mo", "mn", "msup", "msub",
      "mfrac", "mover", "munder", "msqrt", "mtable", "mtr", "mtd",
      "annotation", "semantics", "mspace", "mtext", "mpadded",
      "svg", "path", "line", "rect", "circle", "g", "text", "defs",
      "marker", "polygon", "polyline", "foreignObject",
    ],
    ADD_ATTR: [
      "loading", "decoding", "class", "style", "xmlns", "viewBox", "d", "fill", "stroke",
      "stroke-width", "transform", "x", "y", "width", "height",
      "text-anchor", "dominant-baseline", "font-size", "font-family",
      "marker-end", "id", "aria-hidden", "focusable", "role",
      "mathvariant", "encoding",
    ],
  });

  const assetPaths: string[] = [];
  if (baseDir) {
    html = resolveRelativeImages(html, baseDir, assetPaths);
  }

  return { html, frontmatter, wordCount, assetPaths, isMarp };
}

function resolveRelativeImages(html: string, baseDir: string, collected: string[]): string {
  return html.replace(
    /(<img\s[^>]*?\bsrc=")(?!https?:\/\/|data:|blob:|asset:|file:)([^"]+)(")/gi,
    (_match, before, src, after) => {
      const imagePath = resolveLocalPath(src, baseDir);
      try {
        const url = `${before}${convertFileSrc(imagePath)}${after}`;
        collected.push(imagePath);
        return url;
      } catch {
        return `${before}${src}${after}`;
      }
    }
  ).replace(
    /(<(?:img|source)\s[^>]*?\bsrcset=")([^"]+)(")/gi,
    (_match, before, srcset, after) => `${before}${resolveSrcset(srcset, baseDir, collected)}${after}`
  );
}

function resolveSrcset(srcset: string, baseDir: string, collected: string[]): string {
  return srcset
    .split(",")
    .map((candidate) => {
      const trimmed = candidate.trim();
      if (!trimmed) return trimmed;

      const [src, ...descriptor] = trimmed.split(/\s+/);
      if (isExternalSrc(src)) return trimmed;

      try {
        const imagePath = resolveLocalPath(src, baseDir);
        const converted = convertFileSrc(imagePath);
        collected.push(imagePath);
        return [converted, ...descriptor].join(" ");
      } catch {
        return trimmed;
      }
    })
    .join(", ");
}

function isExternalSrc(src: string): boolean {
  return /^(?:https?:\/\/|data:|blob:|asset:|file:)/i.test(src);
}
