import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { safeDir, sha } from "./images";

export interface DocumentStore {
  /** Copies one supplier PDF into app storage; returns its local path relative to the store root (`docs/...`). */
  save(input: { code: string; index: number; url: string }): Promise<string>;
  /** Optional: whether a stored relative path still exists on disk (lets repair spot vanished files). */
  has?(rel: string): Promise<boolean>;
}

export interface FsDocumentStoreOptions {
  /** Per-document timeout (download + body), default 30s. */
  timeoutMs?: number;
  /** Max PDF size in bytes, default 20 MB. */
  maxBytes?: number;
  /** Max download attempts for transient failures, default 3. */
  attempts?: number;
  /** Injectable sleep (tests); default setTimeout. */
  sleep?: (ms: number) => Promise<void>;
}

/** Marks failures worth retrying (throttling HTML pages, 429/5xx, network/timeout). */
class TransientError extends Error {}

const BACKOFF_MS = [1000, 3000];
const jitter = (ms: number) => ms + Math.floor(Math.random() * ms * 0.25);
const HEADER_WINDOW = 1024;

const DEFAULT_TIMEOUT_MS = 30_000;
const DEFAULT_MAX_BYTES = 40 * 1024 * 1024;
const ACCEPTED_TYPE = /^(application\/pdf|application\/octet-stream)\b/i;

/** Deterministic relative path: `docs/<safe-code>/<index>-<urlhash>.pdf`. */
export function documentFileName(code: string, index: number, url: string): string {
  return `docs/${safeDir(code)}/${index}-${sha(url, 10)}.pdf`;
}

/** Filesystem store writing PDFs under `<IMAGES_DIR>/docs`; skips files already present. */
export class FsDocumentStore implements DocumentStore {
  private readonly timeoutMs: number;
  private readonly maxBytes: number;
  private readonly attempts: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly dir: string | undefined = process.env.IMAGES_DIR,
    private readonly fetchFn: typeof fetch = fetch,
    options: FsDocumentStoreOptions = {},
  ) {
    if (!dir) throw new Error("IMAGES_DIR is not set");
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.maxBytes = options.maxBytes ?? DEFAULT_MAX_BYTES;
    this.attempts = Math.max(1, options.attempts ?? 3);
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
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
    for (let attempt = 1; ; attempt++) {
      try {
        const body = await this.download(url);
        await mkdir(path.dirname(abs), { recursive: true });
        await writeFile(tmp, body);
        await rename(tmp, abs);
        return rel;
      } catch (e) {
        await rm(tmp, { force: true });
        if (!(e instanceof TransientError) || attempt >= this.attempts) throw e;
        await this.sleep(jitter(BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length) - 1]));
      }
    }
  }

  /** One download attempt; throws TransientError for retryable failures. */
  private async download(url: string): Promise<Buffer> {
    let res: Response;
    try {
      res = await this.fetchFn(url, { redirect: "follow", signal: AbortSignal.timeout(this.timeoutMs) });
    } catch (e) {
      throw new TransientError(e instanceof Error ? e.message : String(e), { cause: e });
    }
    if (!res.ok) {
      const msg = `Document download failed (${res.status}) for ${url}`;
      throw res.status === 429 || res.status >= 500 ? new TransientError(msg) : new Error(msg);
    }
    const type = res.headers.get("content-type") ?? "";
    if (!ACCEPTED_TYPE.test(type)) {
      const msg = `Unexpected content-type "${type}" for ${url}`;
      // Dropbox answers throttled requests with an HTML page: retry those.
      throw /^text\/html/i.test(type) ? new TransientError(msg) : new Error(msg);
    }
    const declared = Number(res.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > this.maxBytes) throw new Error(`Document too large (${declared} bytes) for ${url}`);
    if (!res.body) throw new TransientError(`Document download empty for ${url}`);
    const chunks: Uint8Array[] = [];
    let total = 0;
    try {
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
    } catch (e) {
      if (e instanceof Error && /too large/.test(e.message)) throw e;
      throw new TransientError(e instanceof Error ? e.message : String(e), { cause: e });
    }
    const body = Buffer.concat(chunks);
    // Readers accept the header anywhere in the first 1024 bytes (some files start with whitespace).
    if (!body.subarray(0, HEADER_WINDOW).includes("%PDF-", 0, "latin1")) {
      throw new Error(`Document is not a PDF (missing %PDF- header) for ${url}`);
    }
    return body;
  }
}
