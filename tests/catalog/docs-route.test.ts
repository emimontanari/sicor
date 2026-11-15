import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { GET } from "../../src/app/docs/[...path]/route";

let tmp: string;
let prev: string | undefined;
beforeAll(async () => {
  prev = process.env.IMAGES_DIR;
  tmp = await mkdtemp(path.join(tmpdir(), "sicor-route-"));
  const root = path.join(tmp, "images");
  await mkdir(path.join(root, "docs", "ZAP13"), { recursive: true });
  await mkdir(path.join(tmp, "outside"));
  await writeFile(path.join(root, "docs", "ZAP13", "0-abc.pdf"), "%PDF-1.4 body");
  await writeFile(path.join(root, "docs", "ZAP13", "note.txt"), "x");
  await writeFile(path.join(tmp, "outside", "s.pdf"), "%PDF-secret");
  await symlink(path.join(tmp, "outside"), path.join(root, "docs", "link"));
  process.env.IMAGES_DIR = root;
});
afterAll(async () => {
  if (prev === undefined) delete process.env.IMAGES_DIR;
  else process.env.IMAGES_DIR = prev;
  await rm(tmp, { recursive: true, force: true });
});

const get = (segments: string[], qs = "") =>
  GET(new Request(`http://x/docs/${segments.join("/")}${qs}`), { params: Promise.resolve({ path: segments }) });

describe("GET /docs/[...path]", () => {
  it("serves the pdf inline with cache headers and a sanitized filename", async () => {
    const res = await get(["ZAP13", "0-abc.pdf"], "?n=ZAP13-Ficha%20t%C3%A9cnica");
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/pdf");
    expect(res.headers.get("content-disposition")).toBe('inline; filename="ZAP13-Ficha tecnica.pdf"');
    expect(res.headers.get("cache-control")).toContain("max-age=31536000");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(await res.text()).toBe("%PDF-1.4 body");
  });
  it("sanitizes hostile filenames and falls back to the file name", async () => {
    const hostile = await get(["ZAP13", "0-abc.pdf"], "?n=" + encodeURIComponent('a"\r\nX: y/../b'));
    const cd = hostile.headers.get("content-disposition")!;
    expect(cd).toMatch(/^inline; filename="[A-Za-z0-9 ._-]+\.pdf"$/);
    expect((await get(["ZAP13", "0-abc.pdf"])).headers.get("content-disposition")).toBe('inline; filename="0-abc.pdf"');
  });
  it.each([[["..", "x.pdf"]], [["ZAP13", "note.txt"]], [["ZAP13", "nope.pdf"]], [["link", "s.pdf"]], [[]]])("404 for %j", async (segs) => {
    expect((await get(segs as string[])).status).toBe(404);
  });
  it("404 when IMAGES_DIR is unset", async () => {
    const keep = process.env.IMAGES_DIR;
    delete process.env.IMAGES_DIR;
    expect((await get(["ZAP13", "0-abc.pdf"])).status).toBe(404);
    process.env.IMAGES_DIR = keep;
  });
});
