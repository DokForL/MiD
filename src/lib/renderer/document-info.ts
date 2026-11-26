/**
 * Whether a parsed frontmatter block marks the document as a Marp deck. The
 * naive frontmatter parser stores values as strings, so `marp: true` arrives as
 * the string `"true"`; accept both that and a real boolean.
 */
export function isMarpDoc(frontmatter: Record<string, unknown> | null): boolean {
  const v = frontmatter?.marp;
  return v === true || v === "true";
}

/**
 * Resolve a local path (image src or markdown link href) against `baseDir`.
 * Decodes `%20`, passes absolute/Windows paths through, and normalizes `./`,
 * `../`, and mixed separators. Shared by image rendering and local-file links
 * (issue #30) so there's a single resolution implementation.
 */
export function resolveLocalPath(src: string, baseDir: string): string {
  const decodedSrc = decodeImageSrc(src);
  if (isAbsolutePath(decodedSrc)) return decodedSrc;
  return normalizePath(`${baseDir}/${decodedSrc}`);
}

function decodeImageSrc(src: string): string {
  try {
    return decodeURI(src);
  } catch {
    return src;
  }
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
}

function normalizePath(path: string): string {
  const isWindowsPath = /^[a-zA-Z]:[\\/]/.test(path) || path.startsWith("\\\\");
  const separator = isWindowsPath ? "\\" : "/";
  const normalized = path.replace(/[\\/]+/g, separator);
  const prefix = normalized.startsWith(separator) ? separator : "";
  const parts = normalized.split(separator);
  const stack: string[] = [];

  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === ".." && stack.length > 0 && stack[stack.length - 1] !== "..") {
      stack.pop();
    } else if (part !== ".." || !prefix) {
      stack.push(part);
    }
  }

  return `${prefix}${stack.join(separator)}`;
}
