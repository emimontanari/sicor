import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsImageStore, imageFileName } from "../../src/server/sync";

let dir: string;
let parent: string;
beforeEach(async () => {
  parent = await mkdtemp(path.join(tmpdir(), "sicor-img-"));
  dir = path.join(parent, "images");
});
afterEach(async () => {
  await rm(parent, { recursive: true, force: true });
});

const img = (body: BodyInit = new Uint8Array([1, 2, 3]), headers: Record<string, string> = { "content-type": "image/png" }) =>
  new Response(body, { headers });
const ok = (async () => img()) as typeof fetch;
const URL_OK = "https://dl.dropbox.com/x/a.png?dl=1";

async function allFiles(d: string): Promise<string[]> {
  const out: string[] = [];
  for (const e of await readdir(d, { withFileTypes: true, recursive: true }).catch(() => [])) {
    if (e.isFile()) out.push(path.join(e.parentPath, e.name));
  }
  return out;
}

describe("FsImageStore (S6)", () => {
  it("downloads once, deterministic name, skips when present", async () => {
    let calls = 0;
    const store = new FsImageStore(dir, (async () => {
      calls++;
      return img();
    }) as typeof fetch);
    const rel = await store.save({ code: "A/1", index: 0, url: URL_OK });
    expect(rel).toBe(imageFileName("A/1", 0, URL_OK));
    expect(rel).toMatch(/^A_1-[0-9a-f]{8}\/0-[0-9a-f]{10}\.png$/);
    expect([...(await readFile(path.join(dir, rel)))]).toEqual([1, 2, 3]);
    expect(await store.save({ code: "A/1", index: 0, url: URL_OK })).toBe(rel);
    expect(calls).toBe(1);
  });

  it("rejects on HTTP error and writes nothing", async () => {
    const store = new FsImageStore(dir, (async () => new Response("no", { status: 404 })) as typeof fetch);
    await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/404/);
    expect(await allFiles(dir)).toEqual([]);
  });

  it.each(["..", ".", "a/../../b", "..\\x", "../..", ""])("code %j stays inside the images dir", async (code) => {
    const store = new FsImageStore(dir, ok);
    const rel = await store.save({ code, index: 0, url: URL_OK });
    const abs = path.resolve(dir, rel);
    expect(abs.startsWith(path.resolve(dir) + path.sep)).toBe(true);
    expect(path.dirname(rel)).not.toMatch(/^\.\.?$/);
    expect(rel).not.toContain("..");
    const files = await allFiles(parent);
    expect(files).toHaveLength(1);
    expect(files[0].startsWith(path.resolve(dir) + path.sep) || files[0].startsWith(dir + path.sep)).toBe(true);
  });

  it("rejects non-https URLs without fetching", async () => {
    let calls = 0;
    const store = new FsImageStore(dir, (async () => (calls++, img())) as typeof fetch);
    await expect(store.save({ code: "A", index: 0, url: "http://x/a.png" })).rejects.toThrow(/https/);
    await expect(store.save({ code: "A", index: 0, url: "not a url" })).rejects.toThrow(/https/);
    expect(calls).toBe(0);
  });

  it("rejects non-image content types and leaves no files", async () => {
    const store = new FsImageStore(dir, (async () => img("<html>", { "content-type": "text/html" })) as typeof fetch);
    await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/content-type/i);
    expect(await allFiles(dir)).toEqual([]);
  });

  it("rejects oversize bodies (declared and streamed) and leaves no files", async () => {
    const declared = new FsImageStore(
      dir,
      (async () => img(new Uint8Array(10), { "content-type": "image/png", "content-length": "999999" })) as typeof fetch,
      { maxBytes: 100 },
    );
    await expect(declared.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/too large/i);
    const streamed = new FsImageStore(dir, (async () => img(new Uint8Array(500))) as typeof fetch, { maxBytes: 100 });
    await expect(streamed.save({ code: "A", index: 1, url: URL_OK })).rejects.toThrow(/too large/i);
    expect(await allFiles(dir)).toEqual([]);
  });

  it("a hanging fetch rejects within the configured timeout", async () => {
    const hang = ((_u: string, init?: RequestInit) =>
      new Promise((_res, rej) => {
        init?.signal?.addEventListener("abort", () => rej(init.signal!.reason));
      })) as unknown as typeof fetch;
    const store = new FsImageStore(dir, hang, { timeoutMs: 50 });
    const t = Date.now();
    await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow();
    expect(Date.now() - t).toBeLessThan(2000);
    expect(await allFiles(dir)).toEqual([]);
  });
});
