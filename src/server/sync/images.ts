import { createHash } from "node:crypto";
import { access, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";

export interface ImageStore {
  /** Copies one supplier image into app storage; returns its local path (relative to the store root). */
  save(input: { code: string; index: number; url: string }): Promise<string>;
}

const safe = (s: string) => s.replace(/[^A-Za-z0-9._-]/g, "_");

/** Deterministic relative file name: `<code>/<index>-<urlhash>.<ext>`. */
export function imageFileName(code: string, index: number, url: string): string {
  const hash = createHash("sha256").update(url).digest("hex").slice(0, 10);
  let ext = ".jpg";
  try {
    const e = path.extname(new URL(url).pathname).toLowerCase();
    if (/^\.[a-z0-9]{2,5}$/.test(e)) ext = e;
  } catch {
    /* keep default */
  }
  return `${safe(code)}/${index}-${hash}${ext}`;
}

/** Filesystem store writing under IMAGES_DIR; skips files already present. */
export class FsImageStore implements ImageStore {
  constructor(
    private readonly dir: string | undefined = process.env.IMAGES_DIR,
    private readonly fetchFn: typeof fetch = fetch,
  ) {
    if (!dir) throw new Error("IMAGES_DIR is not set");
  }

  async save({ code, index, url }: { code: string; index: number; url: string }): Promise<string> {
    const rel = imageFileName(code, index, url);
    const abs = path.join(this.dir!, rel);
    try {
      await access(abs);
      return rel;
    } catch {
      /* not present yet */
    }
    const res = await this.fetchFn(url, { redirect: "follow" });
    if (!res.ok) throw new Error(`Image download failed (${res.status}) for ${url}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error(`Image download empty for ${url}`);
    await mkdir(path.dirname(abs), { recursive: true });
    const tmp = `${abs}.tmp`;
    await writeFile(tmp, buf);
    await rename(tmp, abs);
    return rel;
  }
}
