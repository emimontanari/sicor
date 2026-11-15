import { createHash } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ImageStore {
  /** Copies one supplier image into app storage; returns its local path (relative to the store root). */
  save(input: { code: string; index: number; url: string }): Promise<string>;
  /** Optional: whether a stored relative path still exists on disk. */
  has?(rel: string): Promise<boolean>;
}

export interface FsImageStoreOptions {
  /** Per-image timeout (download + body), default 20s. */
  timeoutMs?: number;
  /** Max image size in bytes, default 8 MB. */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;

export const sha = (s: string, n: number) => createHash("sha256").update(s).digest("hex").slice(0, n);

/** Directory-safe name: only [A-Za-z0-9_-], so never `.`/`..` and never a separator. */
export function safeDir(code: string): string {
  const cleaned = code.replace(/[^A-Za-z0-9_-]/g, "_") || "_";
  // Disambiguate codes that were altered so e.g. "A.1" and "A_1" do not collide.
  return cleaned === code ? cleaned : `${cleaned}-${sha(code, 8)}`;
}

/** Deterministic relative file name: `<code>/<index>-<urlhash>.<ext>`. */
export function imageFileName(code: string, index: number, url: string): string {
  let ext = ".jpg";
  try {
    const e = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(e)) ext = e;
  } catch {
    /* keep default */
  }
  return `${safeDir(code)}/${index}-${sha(url, 10)}${ext}`;
}

/** Filesystem store writing under IMAGES_DIR; skips files already present. */
export class FsImageStore implements ImageStore {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(
    readonly dir: string | undefined = process.env.IMAGES_DIR,
    readonly fetchFn: typeof fetch = fetch,
    options: FsImageStoreOptions = {},
  ) {
    if (!dir) throw new Error("IMAGES_DIR is not set");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async has(rel: string): Promise<boolean> {
    try {
      await access(path.resolve(this.dir!, rel));
      return true;
    } catch {
      return false;
    }
  }

  async save({ code, index, url }: { code: string; index: number; url: string }): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Image URL must be a valid https URL: ${url}`);
    }
    if (parsed.protocol !== "https:") throw new Error(`Image URL must use https: ${url}`);

    const root = path.resolve(this.dir!);
    const rel = imageFileName(code, index, url);
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(root + path.sep)) throw new Error(`Image path escapes the images dir: ${rel}`);

    try {
      await access(abs);
      return rel;
    } catch {
      /* not present yet */
    }

    const tmp = `${abs}.tmp`;
    try {
      const signal = AbortSignal.timeout(this.timeoutMs);
      const res = await this.fetchFn(url, { redirect: "follow", signal });
      if (!res.ok) throw new Error(`Image download failed (${res.status}) for ${url}`);
      const type = res.headers.get("content-type") ?? "";
      if (!/^image\//i.test(type)) throw new Error(`Unexpected content-type "${type}" for ${url}`);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > this.maxBytes) {
        throw new Error(`Image too large (${declared} bytes) for ${url}`);
      }
      if (!res.body) throw new Error(`Image download empty for ${url}`);
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > this.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`Image too large (>${this.maxBytes} bytes) for ${url}`);
        }
        chunks.push(value);
      }
      if (total === 0) throw new Error(`Image download empty for ${url}`);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(tmp, Buffer.concat(chunks));
      await rename(tmp, abs);
      return rel;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }
}
