import { mayContainMath } from "./document-info";
import { useMath } from "./math-markdown";
import { initRenderer as initialize, parseMarkdown } from "./parse-markdown";
import { finalizeMarkdown, type RenderResult } from "./finalize-markdown";

export { isInitialized, stripFrontmatter } from "./parse-markdown";
export { isMarpDoc, resolveLocalPath } from "./document-info";
export type { RenderResult } from "./finalize-markdown";

export function initRenderer(): void {
  initialize(useMath);
}

export function render(markdown: string, baseDir?: string): string {
  return renderFull(markdown, baseDir).html;
}

export function renderFull(markdown: string, baseDir?: string): RenderResult {
  return finalizeMarkdown(parseMarkdown(markdown, mayContainMath(markdown) ? useMath : undefined), baseDir);
}
