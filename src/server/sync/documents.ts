import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeDir, sha } from "./images";

export interface DocumentStore {
  /** Copies one supplier PDF into app storage; returns its local path relative to the store root (`docs/...`). */
  save(input: { code: string; index: number; url: string }): Promise<string>;
}

export interface FsDocumentStoreOptions {
  /** Per-document timeout (download + body), default 30s. */
  timeoutMs?: number;
  /** Max PDF size in bytes, default 20 MB. */
  maxBytes?: number;
}

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 20 * 1024 * 1024;
const ACCEPTED_TYPE = /^(application\/pdf|application\/octet-stream)\b/i;

/** Deterministic relative path: `docs/<safe-code>/<index>-<urlhash>.pdf`. */
export function documentFileName(code: string, index: number, url: string): string {
  return `docs/${safeDir(code)}/${index}-${sha(url, 10)}.pdf`;
}

/** Filesystem store writing PDFs under `<IMAGES_DIR>/docs`; skips files already present. */
export class FsDocumentStore implements DocumentStore {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;

  constructor(
    private readonly dir: string | undefined = process.env.IMAGES_DIR,
    private readonly fetchFn: typeof fetch = fetch,
    options: FsDocumentStoreOptions = {},
  ) {
    if (!dir) throw new Error("IMAGES_DIR is not set");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
  }

  async save({ code, index, url }: { code: string; index: number; url: string }): Promise<string> {
    let parsed: URL;
    try {
      parsed = new URL(url);
    } catch {
      throw new Error(`Document URL must be a valid https URL: ${url}`);
    }
    if (parsed.protocol !== "https:") throw new Error(`Document URL must use https: ${url}`);

    const root = path.resolve(this.dir!);
    const rel = documentFileName(code, index, url);
    const abs = path.resolve(root, rel);
    if (!abs.startsWith(path.join(root, "docs") + path.sep)) throw new Error(`Document path escapes the docs dir: ${rel}`);

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
      if (!res.ok) throw new Error(`Document download failed (${res.status}) for ${url}`);
      const type = res.headers.get("content-type") ?? "";
      if (!ACCEPTED_TYPE.test(type)) throw new Error(`Unexpected content-type "${type}" for ${url}`);
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > this.maxBytes) throw new Error(`Document too large (${declared} bytes) for ${url}`);
      if (!res.body) throw new Error(`Document download empty for ${url}`);
      const chunks: Uint8Array[] = [];
      let total = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.length;
        if (total > this.maxBytes) {
          await reader.cancel().catch(() => undefined);
          throw new Error(`Document too large (>${this.maxBytes} bytes) for ${url}`);
        }
        chunks.push(value);
      }
      const body = Buffer.concat(chunks);
      if (body.subarray(0, 5).toString("latin1") !== "%PDF-") throw new Error(`Document is not a PDF (missing %PDF- header) for ${url}`);
      await mkdir(path.dirname(abs), { recursive: true });
      await writeFile(tmp, body);
      await rename(tmp, abs);
      return rel;
    } catch (e) {
      await rm(tmp, { force: true });
      throw e;
    }
  }
}
