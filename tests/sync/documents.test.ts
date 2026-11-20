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

  it("documents are copied only for inserts; existing documents are neither added nor removed", async () => {
    setCatalog(product("A"), product("B", [doc("b", "ficha", "Ficha técnica")]));
    await engine.apply((await engine.check("manual")).id);
    const before = [await row("A"), await row("B")];
    setCatalog(product("A", [doc("a", "ficha", "Ficha técnica")]), product("B"), product("C", [doc("c", "ficha", "Ficha técnica")]));
    const run = await engine.check("manual");
    expect(run.changes).toEqual([{ type: "new", code: "C", name: "Product C" }]);
    await engine.apply(run.id);
    expect([await row("A"), await row("B")]).toEqual(before);
    expect((await row("C")).localDocuments).toHaveLength(1);
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

  it("rejects oversize (declared and streamed), default cap is 40 MB, and leaves no files", async () => {
    const declared = new FsDocumentStore(dir, (async () => new Response("%PDF-1", { headers: { "content-type": "application/pdf", "content-length": "999" } })) as typeof fetch, { maxBytes: 100 });
    await expect(declared.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/too large/i);
    const streamed = new FsDocumentStore(dir, (async () => pdf("%PDF-" + "x".repeat(500))) as typeof fetch, { maxBytes: 100 });
    await expect(streamed.save({ code: "A", index: 1, url: URL_OK })).rejects.toThrow(/too large/i);
    const big = new FsDocumentStore(dir, (async () => new Response("%PDF-1", { headers: { "content-type": "application/pdf", "content-length": String(41 * 1024 * 1024) } })) as typeof fetch);
    await expect(big.save({ code: "A", index: 2, url: URL_OK })).rejects.toThrow(/too large/i);
    expect(await files(dir)).toEqual([]);
  });

  it("accepts %PDF- anywhere in the first 1024 bytes, rejects it later", async () => {
    const lead = new FsDocumentStore(dir, (async () => pdf("\n \r\n  %PDF-1.4 x")) as typeof fetch);
    await expect(lead.save({ code: "A", index: 0, url: URL_OK })).resolves.toMatch(/\.pdf$/);
    const edge = new FsDocumentStore(dir, (async () => pdf(" ".repeat(1019) + "%PDF-")) as typeof fetch);
    await expect(edge.save({ code: "B", index: 0, url: URL_OK })).resolves.toMatch(/\.pdf$/);
    const late = new FsDocumentStore(dir, (async () => pdf(" ".repeat(1020) + "%PDF-")) as typeof fetch);
    await expect(late.save({ code: "C", index: 0, url: URL_OK })).rejects.toThrow(/PDF/);
  });

  describe("transient retries", () => {
    const mk = (responses: (() => Response | Promise<Response>)[], delays: number[] = []) => {
      let i = 0;
      const fetchFn = (async () => responses[Math.min(i++, responses.length - 1)]()) as typeof fetch;
      const store = new FsDocumentStore(dir, fetchFn, { sleep: async (ms) => void delays.push(ms) });
      return { store, calls: () => i };
    };
    const html = () => pdf("<html>", "text/html; charset=utf-8");
    it.each([
      ["html content-type", html],
      ["429", () => new Response("", { status: 429 })],
      ["503", () => new Response("", { status: 503 })],
    ])("retries %s then succeeds with backoff", async (_n, bad) => {
      const delays: number[] = [];
      const { store, calls } = mk([bad, bad, () => pdf()], delays);
      await expect(store.save({ code: "A", index: 0, url: URL_OK })).resolves.toMatch(/\.pdf$/);
      expect(calls()).toBe(3);
      expect(delays).toHaveLength(2);
      expect(delays[0]).toBeGreaterThanOrEqual(1000);
      expect(delays[0]).toBeLessThan(2000);
      expect(delays[1]).toBeGreaterThanOrEqual(3000);
      expect(delays[1]).toBeLessThan(4500);
    });
    it("retries network errors, gives up after 3 attempts and leaves no files", async () => {
      const { store, calls } = mk([() => Promise.reject(new TypeError("fetch failed"))]);
      await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow(/fetch failed/);
      expect(calls()).toBe(3);
      expect(await files(dir)).toEqual([]);
    });
    it.each([
      ["404", () => new Response("", { status: 404 })],
      ["not a pdf", () => pdf("<html>", "application/pdf")],
      ["too large", () => new Response("%PDF-", { headers: { "content-type": "application/pdf", "content-length": String(50 * 1024 * 1024) } })],
    ])("does not retry permanent failure: %s", async (_n, bad) => {
      const { store, calls } = mk([bad]);
      await expect(store.save({ code: "A", index: 0, url: URL_OK })).rejects.toThrow();
      expect(calls()).toBe(1);
    });
  });

  it("has() reflects files on disk", async () => {
    const store = new FsDocumentStore(dir, (async () => pdf()) as typeof fetch);
    const rel = await store.save({ code: "A", index: 0, url: URL_OK });
    expect(await store.has(rel)).toBe(true);
    expect(await store.has("docs/A/9-zzz.pdf")).toBe(false);
  });

  it("a hanging fetch rejects within the timeout", async () => {
    const hang = ((_u: string, init?: RequestInit) => new Promise((_r, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal!.reason)))) as unknown as typeof fetch;
    const store = new FsDocumentStore(dir, hang, { timeoutMs: 50, sleep: async () => undefined });
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

describe("document concurrency", () => {
  it("defaults to 2 simultaneous document downloads", async () => {
    let active = 0;
    let max = 0;
    const slow: DocumentStore = {
      async save(i) {
        max = Math.max(max, ++active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
        return `docs/${i.code}/${i.index}-x.pdf`;
      },
    };
    const eng = createSyncEngine({ db: ctx.db, source, imageStore: new FakeImages(), documentStore: slow });
    setCatalog(product("A", Array.from({ length: 8 }, (_, i) => doc(`c${i}`))));
    await eng.apply((await eng.check("manual")).id);
    expect(max).toBe(2);
  });
});

describe("repairAssets (self-healing)", () => {
  class FlakyImages implements ImageStore {
    failing = new Set<string>();
    async save(i: { code: string; index: number; url: string }) {
      if (this.failing.has(i.url)) throw new Error("boom");
      return `${i.code}/${i.index}.jpg`;
    }
  }
  const withImages = (code: string, documents: SupplierDocument[]) =>
    product(code, documents, { images: { small: [], large: [`https://dl/${code}-0.jpg`, `https://dl/${code}-1.jpg`] } });

  it("re-downloads only missing documents/images, updates local_* only and reports counts", async () => {
    const imgs = new FlakyImages();
    imgs.failing.add("https://dl/A-1.jpg");
    const eng = createSyncEngine({ db: ctx.db, source, imageStore: imgs, documentStore: docs });
    const f = doc("f", "ficha", "Ficha técnica");
    const bad = doc("bad", "certificacion", "ISP");
    docs.failUrls.add(bad.url);
    setCatalog(withImages("A", [f, bad]), product("B", [doc("b")]));
    await eng.apply((await eng.check("manual")).id);
    await ctx.db.insert(schema.productOverrides).values({ productCode: "A", customName: "Mine", visible: true });
    expect((await row("A")).localDocuments).toHaveLength(1);
    expect((await row("A")).localImages).toEqual(["A/0.jpg"]);
    const callsBefore = docs.calls.length;

    // nothing recovered yet: still missing, with warnings
    let r = await eng.repairAssets();
    expect(r.repaired).toBe(0);
    expect(r.stillMissing).toBe(2);
    expect(r.warnings.map((w) => w.url).sort()).toEqual(["https://dl.example/bad.pdf", "https://dl/A-1.jpg"]);
    expect(docs.calls.slice(callsBefore)).toEqual([f.url, bad.url]); // only product A has gaps

    docs.failUrls.clear();
    imgs.failing.clear();
    r = await eng.repairAssets();
    expect(r).toMatchObject({ repaired: 2, stillMissing: 0, warnings: [] });
    const a = await row("A");
    expect(a.localDocuments).toEqual([
      { kind: "ficha", label: "Ficha técnica", path: "docs/A/0-x.pdf" },
      { kind: "certificacion", label: "ISP", path: "docs/A/1-x.pdf" },
    ]);
    expect(a.localImages).toEqual(["A/0.jpg", "A/1.jpg"]);
    const [o] = await ctx.db.select().from(schema.productOverrides);
    expect(o).toMatchObject({ productCode: "A", customName: "Mine" });
    const n = docs.calls.length;
    expect(await eng.repairAssets()).toEqual({ repaired: 0, stillMissing: 0, warnings: [] });
    expect(docs.calls.length).toBe(n);
  });

  it("apply leaves existing PDF gaps alone until explicit repair", async () => {
    docs.failUrls.add("https://dl.example/x.pdf");
    setCatalog(product("A", [doc("x")]));
    await engine.apply((await engine.check("manual")).id);
    expect((await row("A")).localDocuments).toEqual([]);
    docs.failUrls.clear();
    setCatalog(product("A", [doc("x")]), product("B"));
    await engine.apply((await engine.check("manual")).id);
    expect((await row("A")).localDocuments).toEqual([]);
    expect(await engine.repairAssets()).toMatchObject({ repaired: 1, stillMissing: 0 });
    expect((await row("A")).localDocuments).toHaveLength(1);
  });

  it("treats local entries whose file vanished from disk as missing (stores with has())", async () => {
    const present = new Set<string>();
    const store: DocumentStore & { has(p: string): Promise<boolean> } = {
      async save(i) {
        const p = `docs/${i.code}/${i.index}-x.pdf`;
        present.add(p);
        return p;
      },
      has: async (p) => present.has(p),
    };
    const eng = createSyncEngine({ db: ctx.db, source, imageStore: new FakeImages(), documentStore: store });
    setCatalog(product("A", [doc("x")]));
    await eng.apply((await eng.check("manual")).id);
    present.clear();
    const r = await eng.repairAssets();
    expect(r.repaired).toBe(1);
    expect(present.size).toBe(1);
  });

  it("never fails on store errors and ignores discontinued products", async () => {
    setCatalog(product("A", [doc("x")]));
    docs.failUrls.add("https://dl.example/x.pdf");
    await engine.apply((await engine.check("manual")).id);
    await ctx.db.update(schema.sourceProducts).set({ status: "discontinued" });
    docs.failUrls.clear();
    expect(await engine.repairAssets()).toEqual({ repaired: 0, stillMissing: 0, warnings: [] });
  });
});
