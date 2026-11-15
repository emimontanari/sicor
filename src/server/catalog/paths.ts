import { realpath, stat } from "node:fs/promises";
import path from "node:path";

const TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".avif": "image/avif",
};

/** Image content type for a file name, or null when it is not a served image type. */
export function imageContentType(file: string): string | null {
  return TYPES[path.extname(file).toLowerCase()] ?? null;
}

/**
 * S7: maps URL path segments to an absolute file under `root`, or null.
 * Pure (no fs). Rejects empty/dot segments, separators, NUL, drive letters,
 * (double-)encoded traversal, non-image extensions and anything resolving outside root.
 */
export function resolveImagePath(root: string, segments: readonly string[]): string | null {
  return resolveConfined(root, segments, (name) => imageContentType(name) !== null);
}

/** Shared lexical confinement: `accept(lastSegment)` decides which file names may be served. */
function resolveConfined(root: string, segments: readonly string[], accept: (name: string) => boolean): string | null {
  if (!path.isAbsolute(root) || segments.length === 0) return null;
  for (const seg of segments) {
    if (seg === "" || seg === "." || seg === "..") return null;
    if (/[/\\\0]/.test(seg) || /^[a-zA-Z]:/.test(seg)) return null;
    if (/%/.test(seg)) {
      // Segments arrive already decoded; a remaining "%" hiding traversal is suspicious.
      let decoded: string;
      try {
        decoded = decodeURIComponent(seg);
      } catch {
        return null;
      }
      if (decoded === ".." || decoded === "." || /[/\\\0]/.test(decoded)) return null;
    }
  }
  const last = segments[segments.length - 1];
  if (!accept(last)) return null;
  const base = path.resolve(root);
  const full = path.resolve(base, ...segments);
  if (!full.startsWith(base + path.sep)) return null;
  return full;
}

/** App URL (`/images/...`) for a stored relative image path. */
export function imageUrl(stored: string): string {
  const rel = stored.replace(/^\/+/, "").replace(/^images\//, "");
  return "/images/" + rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
}

/**
 * S7: like `resolveImagePath` but also defeats symlink escapes. After the lexical check,
 * the real paths of root and target must still nest, and the target must be a regular file.
 * Symlinks that stay inside the real root are allowed. Returns the real file path or null.
 */
export async function resolveImageFile(
  root: string,
  segments: readonly string[],
): Promise<string | null> {
  const lexical = resolveImagePath(root, segments);
  if (!lexical) return null;
  try {
    const realRoot = await realpath(root);
    const realTarget = await realpath(lexical);
    if (!realTarget.startsWith(realRoot + path.sep)) return null;
    if (imageContentType(realTarget) === null) return null;
    if (!(await stat(realTarget)).isFile()) return null;
    return realTarget;
  } catch {
    return null;
  }
}

const isPdfName = (name: string) => path.extname(name).toLowerCase() === ".pdf";

/**
 * Like `resolveImagePath` for PDFs: only `.pdf` files, and only below `<root>/docs`
 * (segments include the leading `docs`). Same traversal/encoding rejections.
 */
export function resolvePdfPath(root: string, segments: readonly string[]): string | null {
  if (segments[0] !== "docs" || segments.length < 2) return null;
  return resolveConfined(root, segments, isPdfName);
}

/** Symlink-safe variant of {@link resolvePdfPath}: the real target must stay inside the real root. */
export async function resolvePdfFile(root: string, segments: readonly string[]): Promise<string | null> {
  const lexical = resolvePdfPath(root, segments);
  if (!lexical) return null;
  try {
    const realRoot = await realpath(root);
    const realTarget = await realpath(lexical);
    if (!realTarget.startsWith(realRoot + path.sep)) return null;
    if (!isPdfName(realTarget)) return null;
    if (!(await stat(realTarget)).isFile()) return null;
    return realTarget;
  } catch {
    return null;
  }
}

/** App URL (`/docs/...`) for a stored relative document path; `filename` becomes the `?n=` download name. */
export function documentUrl(stored: string, filename?: string): string {
  const rel = stored.replace(/^\/+/, "").replace(/^docs\//, "");
  const base = "/docs/" + rel.split("/").filter(Boolean).map(encodeURIComponent).join("/");
  return filename ? `${base}?n=${encodeURIComponent(filename)}` : base;
}

/** ASCII-only, header-safe download name (no quotes, separators or control chars), always ending in .pdf. */
export function safeDownloadName(wanted: string | null, fallback: string): string {
  const clean = (s: string) =>
    s
      .normalize("NFD")
      .replace(/\p{M}/gu, "")
      .replace(/\.pdf$/i, "")
      .replace(/[^A-Za-z0-9 ._-]/g, "")
      .replace(/\.{2,}/g, ".")
      .trim()
      .slice(0, 100);
  return `${clean(wanted ?? "") || clean(fallback) || "documento"}.pdf`;
}
