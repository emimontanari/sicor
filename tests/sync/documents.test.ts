import { mkdtemp, readdir, readFile, rm, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { migrate } from "drizzle-orm/pglite/migrator";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPgliteDb, schema } from "../../src/server/db";
import type { SupplierCatalog, SupplierDocument, SupplierProduct } from "../../src/server/masefer";
import { canonicalFromSupplier, changedFields, contentHash } from "../../src/server/sync/canonical";
import {
  createSyncEngine,
  documentFileName,
  FsDocumentStore,
  FsImageStore,
  type DocumentStore,
  type ImageStore,
} from "../../src/server/sync";

const doc = (n: string, kind: SupplierDocument["kind"] = "certificacion", label = `Doc ${n}`): SupplierDocument => ({
  kind,
  label,
  url: `https://dl.example/${n}.pdf`,
  name: `${n}.pdf`,
});
function product(code: string, documents: SupplierDocument[] = [], over: Partial<SupplierProduct> = {}): SupplierProduct {
  return {
    code,
    name: `Product ${code}`,
    description: null,
    brand: "B",
    brandId: 1,
    metaCategory: "M",
    family: "F",
    subfamily: "S",
    unit: "UN",
    supplierPrice: 10,
    currency: "ARS",
    images: { small: [], large: [] },
    documents,
    variants: [],
    ...over,
  };
}

describe("canonical documents", () => {
  it("hash is unchanged for products without documents and changes when documents are added/changed/removed", () => {
    const none = canonicalFromSupplier(product("A"));
    const { documents: omitted, ...legacyShape } = product("A") as SupplierProduct & { documents?: unknown };
    void omitted;
    expect(contentHash(canonicalFromSupplier(legacyShape as unknown as SupplierProduct))).toBe(contentHash(none));
    const one = canonicalFromSupplier(product("A", [doc("a", "ficha", "Ficha técnica")]));
    expect(contentHash(one)).not.toBe(contentHash(none));
    expect(changedFields(none, one)).toEqual(["documents"]);
    const renamed = canonicalFromSupplier(product("A", [{ ...doc("a", "ficha", "Ficha técnica"), url: "https://dl.example/other.pdf" }]));
    expect(changedFields(one, renamed)).toEqual(["documents"]);
    expect(changedFields(one, none)).toEqual(["documents"]);
    // `name` is not part of the canonical form
    const sameButName = canonicalFromSupplier(product("A", [{ ...doc("a", "ficha", "Ficha técnica"), name: "zzz.pdf" }]));
    expect(contentHash(sameButName)).toBe(contentHash(one));
  });
});

let ctx: Awaited<ReturnType<typeof createPgliteDb>>;
class FakeSource {
  next: SupplierCatalog = { metaCategories: [], categories: [], brands: [], products: [] };
  async fetchCatalog() {
    return structuredClone(this.next);
  }
}
class FakeImages implements ImageStore {
  async save(i: { code: string; index: number; url: string }) {
    return `${i.code}/${i.index}.jpg`;
  }
}
class FakeDocs implements DocumentStore {
  failUrls = new Set<string>();
  calls: string[] = [];
  async save(i: { code: string; index: number; url: string }) {
    this.calls.push(i.url);
    if (this.failUrls.has(i.url)) throw new Error("not a PDF");
    return `docs/${i.code}/${i.index}-x.pdf`;
  }
}
let source: FakeSource;
let docs: FakeDocs;
let engine: ReturnType<typeof createSyncEngine>;
beforeEach(async () => {
  ctx = await createPgliteDb();
  await migrate(ctx.db, { migrationsFolder: "./drizzle" });
  source = new FakeSource();
  docs = new FakeDocs();
  let t = Date.parse("2026-01-01T00:00:00Z");
  engine = createSyncEngine({ db: ctx.db, source, imageStore: new FakeImages(), documentStore: docs, clock: () => new Date((t += 1000)) });
});
afterEach(async () => {
  await ctx.close();
});
const row = async (code: string) => (await ctx.db.select().from(schema.sourceProducts).where(eq(schema.sourceProducts.code, code)))[0];
const setCatalog = (...products: SupplierProduct[]) => (source.next = { metaCategories: [], categories: [], brands: [], products });

describe("sync apply documents (S1, S4)", () => {
  it("stores supplier documents and aligned local documents; failures are non-fatal warnings", async () => {
    const ficha = doc("f", "ficha", "Ficha técnica");
    const bad = doc("bad", "certificacion", "ISP");
    const good = doc("g", "certificacion", "NIOSH");
    docs.failUrls.add(bad.url);
    setCatalog(product("A", [ficha, bad, good]), product("B"));
    const run = await engine.check("manual");
    const applied = await engine.apply(run.id);
    expect(applied.status).toBe("applied");
    const a = await row("A");
    expect(a.supplierDocuments).toEqual([
      { kind: "ficha", label: "Ficha técnica", url: ficha.url },
      { kind: "certificacion", label: "ISP", url: bad.url },
      { kind: "certificacion", label: "NIOSH", url: good.url },
    ]);
    expect(a.localDocuments).toEqual([
      { kind: "ficha", label: "Ficha técnica", path: "docs/A/0-x.pdf" },
      { kind: "certificacion", label: "NIOSH", path: "docs/A/2-x.pdf" },
    ]);
    expect((await row("B")).localDocuments).toEqual([]);
    const s = applied.summary as unknown as { documentWarnings: number; documentWarningList: { code: string; url: string; reason: string }[] };
    expect(s.documentWarnings).toBe(1);
    expect(s.documentWarningList).toEqual([{ code: "A", url: bad.url, reason: "not a PDF" }]);
  });

  it("bounds the warning list", async () => {
    const many = Array.from({ length: 60 }, (_, i) => doc(`d${i}`));
    for (const d of many) docs.failUrls.add(d.url);
    setCatalog(product("A", many));
    const applied = await engine.apply((await engine.check("manual")).id);
    const s = applied.summary as unknown as { documentWarnings: number; documentWarningList: unknown[] };
    expect(s.documentWarnings).toBe(60);
    expect(s.documentWarningList).toHaveLength(50);
    expect((await row("A")).localDocuments).toEqual([]);
  });

  it("an existing product that only gains documents shows up as changed once, field documents", async () => {
    setCatalog(product("A"));
    await engine.apply((await engine.check("manual")).id);
    setCatalog(product("A", [doc("f", "ficha", "Ficha técnica")]));
    const run = await engine.check("manual");
    expect(run.changes).toEqual([{ type: "changed", code: "A", name: "Product A", fields: ["documents"] }]);
    await engine.apply(run.id);
    const again = await engine.check("manual");
    expect(again.status).toBe("discarded");
    expect(again.summary).toMatchObject({ changed: 0 });
    // removal is detected too
    setCatalog(product("A"));
    const removed = await engine.check("manual");
    expect(removed.changes).toEqual([{ type: "changed", code: "A", name: "Product A", fields: ["documents"] }]);
    await engine.apply(removed.id);
    expect((await row("A")).localDocuments).toEqual([]);
  });
});

describe("FsDocumentStore", () => {
  let parent: string;
  let dir: string;
  beforeEach(async () => {
    parent = await mkdtemp(path.join(tmpdir(), "sicor-doc-"));
    dir = path.join(parent, "images");
  });
  afterEach(async () => {
    await rm(parent, { recursive: true, force: true });
  });
  const URL_OK = "https://dl.dropboxusercontent.com/x/ficha.pdf";
  const pdf = (body: BodyInit = "%PDF-1.4 hello", type = "application/pdf") => new Response(body, { headers: { "content-type": type } });
  const files = async (d: string) =>
    (await readdir(d, { withFileTypes: true, recursive: true }).catch(() => [])).filter((e) => e.isFile()).map((e) => path.join(e.parentPath, e.name));

  it("saves under docs/<code>/<index>-<hash>.pdf, skips when present", async () => {
    let calls = 0;
    const store = new FsDocumentStore(dir, (async () => (calls++, pdf())) as typeof fetch);
    const rel = await store.save({ code: "ZAP13", index: 1, url: URL_OK });
    expect(rel).toBe(documentFileName("ZAP13", 1, URL_OK));
    expect(rel).toMatch(/^docs\/ZAP13\/1-[0-9a-f]{10}\.pdf$/);
    expect((await readFile(path.join(dir, rel))).toString()).toBe("%PDF-1.4 hello");
    expect(await store.save({ code: "ZAP13", index: 1, url: URL_OK })).toBe(rel);
    expect(calls).toBe(1);
    expect(await files(dir)).toHaveLength(1);
  });

  it("accepts application/octet-stream only when bytes start with %PDF-", async () => {
    const ok = new FsDocumentStore(dir, (async () => pdf("%PDF-1.7", "application/octet-stream")) as typeof fetch);
    await expect(ok.save({ code: "A", index: 0, url: URL_OK })).resolves.toMatch(/\.pdf$/);
    const bad = new FsDocumentStore(dir, (async () => pdf("<html>", "application/octet-stream")) as typeof fetch);
    await expect(bad.save({ code: "B", index: 0, url: URL_OK })).rejects.toThrow(/PDF/);
    const lying = new FsDocumentStore(dir, (async () => pdf("<html>", "application/pdf")) as typeof fetch);
    await expect(lying.save({ code: "C", index: 0, url: URL_OK })).rejects.toThrow(/PDF/);
    const html = new FsDocumentStore(dir, (async () => pdf("%PDF-1.7", "text/html")) as typeof fetch);
    await expect(html.save({ code: "D", index: 0, url: URL_OK })).rejects.toThrow(/content-type/i);
    expect((await files(dir)).map((f) => path.basename(path.dirname(f)))).toEqual(["A"]);
  });

  it("rejects http/invalid URLs without fetching and HTTP errors", async () => {
    let calls = 0;
    const store = new FsDocumentStore(dir, (async () => (calls++, new Response("no", { status: 404 }))) as typeof fetch);
    await expect(store.save({ code: "A", index: 0, url: "http://x/a.pdf" })).rejects.toThrow(/https/);
    await expect(store.save({ code: "A", index: 0, url: "nope" })).rejects.toThrow(/https/);
    expect(calls).toBe(0);
    await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/404/);
    expect(await files(dir)).toEqual([]);
  });

  it("rejects oversize (declared and streamed), default cap is 20 MB, and leaves no files", async () => {
    const declared = new FsDocumentStore(dir, (async () => new Response("%PDF-1", { headers: { "content-type": "application/pdf", "content-length": "999" } })) as typeof fetch, { maxBytes: 100 });
    await expect(declared.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/too large/i);
    const streamed = new FsDocumentStore(dir, (async () => pdf("%PDF-" + "x".repeat(500))) as typeof fetch, { maxBytes: 100 });
    await expect(streamed.save({ code: "A", index: 1, url: URL_OK })).rejects.toThrow(/too large/i);
    const big = new FsDocumentStore(dir, (async () => new Response("%PDF-1", { headers: { "content-type": "application/pdf", "content-length": String(21 * 1024 * 1024) } })) as typeof fetch);
    await expect(big.save({ code: "A", index: 2, url: URL_OK })).rejects.toThrow(/too large/i);
    expect(await files(dir)).toEqual([]);
  });

  it("a hanging fetch rejects within the timeout", async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal!.reason)))) as unknown as typeof fetch;
    const store = new FsDocumentStore(dir, hang, { timeoutMs: 50 });
    const t = Date.now();
    await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow();
    expect(Date.now() - t).toBeLessThan(2000);
    expect(await files(dir)).toEqual([]);
  });

  it.each(["..", ".", "a/../../b", "..\\x", ""])("code %j stays inside <dir>/docs", async (code) => {
    const store = new FsDocumentStore(dir, (async () => pdf()) as typeof fetch);
    const rel = await store.save({ code, index: 0, url: URL_OK });
    expect(rel.startsWith("docs/")).toBe(true);
    expect(rel).not.toContain("..");
    const all = await files(parent);
    expect(all).toHaveLength(1);
    expect(all[0].startsWith(path.join(path.resolve(dir), "docs") + path.sep) || all[0].startsWith(path.join(dir, "docs") + path.sep)).toBe(true);
  });

  it("engine derives a document store from an FsImageStore", async () => {
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "keep"), "x");
    const requested: string[] = [];
    const fetchFn = (async (u: string) => (requested.push(String(u)), String(u).endsWith(".pdf") ? pdf() : new Response("", { status: 404 }))) as typeof fetch;
    const eng = createSyncEngine({ db: ctx.db, source, imageStore: new FsImageStore(dir, fetchFn) });
    setCatalog(product("Z", [doc("z", "ficha", "Ficha técnica")]));
    await eng.apply((await eng.check("manual")).id);
    expect((await row("Z")).localDocuments).toEqual([{ kind: "ficha", label: "Ficha técnica", path: documentFileName("Z", 0, "https://dl.example/z.pdf") }]);
    expect(requested).toEqual(["https://dl.example/z.pdf"]);
  });
});
