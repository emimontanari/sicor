import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { FsImageStore, imageFileName } from "../../src/server/sync";

let dir: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "sicor-img-"));
});
afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

describe("FsImageStore (S6)", () => {
  it("downloads once, deterministic name, skips when present", async () => {
    let calls = 0;
    const fetchFn = (async () => {
      calls++;
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch;
    const store = new FsImageStore(dir, fetchFn);
    const url = "https://dl.dropbox.com/x/a.png?dl=1";
    const rel = await store.save({ code: "A/1", index: 0, url });
    expect(rel).toBe(imageFileName("A/1", 0, url));
    expect(rel).toMatch(/^A_1\/0-[0-9a-f]{10}\.png$/);
    expect([...(await readFile(path.join(dir, rel)))]).toEqual([1, 2, 3]);
    expect(await store.save({ code: "A/1", index: 0, url })).toBe(rel);
    expect(calls).toBe(1);
  });
  it("rejects on HTTP error and writes nothing", async () => {
    const store = new FsImageStore(dir, (async () => new Response("no", { status: 404 })) as typeof fetch);
    await expect(store.save({ code: "A", index: 0, url: "https://x/a.jpg" })).rejects.toThrow(/404/);
  });
});
