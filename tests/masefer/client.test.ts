import { describe, expect, it, vi } from "vitest";
import { migrate } from "drizzle-orm/pglite/migrator";
import { runManualCheck } from "../../src/server/admin/sync";
import { createPgliteDb, schema } from "../../src/server/db";
import { createSyncEngine } from "../../src/server/sync";
import catalogFixture from "../fixtures/masefer/catalog.json";
import variantsFixture from "../fixtures/masefer/variants.json";
import { MaseferClient } from "../../src/server/masefer/client";
import type { DdpSocket } from "../../src/server/masefer/ddp";

type Doc = { collection: string; id: string; fields: unknown };
const catalogDocs = catalogFixture.docs as Doc[];
const variantDocs = variantsFixture as Doc[];

type ServerOptions = {
  failSub?: string;
  silentSub?: string;
  disconnectSub?: string;
  genericDocs?: readonly Doc[];
  afterGenericReady?: (socket: DdpSocket) => void;
  subs?: { name: string; params: unknown[] }[];
  connections?: { n: number };
  onClose?: () => void;
};

function serverSocket(opts: ServerOptions = {}) {
  return (): DdpSocket => {
    if (opts.connections) opts.connections.n++;
    const s: DdpSocket = {
      onopen: null, onmessage: null, onerror: null, onclose: null,
      close() { opts.onClose?.(); },
      send(data: string) {
        const m = JSON.parse(data);
        const reply = (o: unknown) => queueMicrotask(() => s.onmessage?.({ data: JSON.stringify(o) }));
        if (m.msg === "connect") return reply({ msg: "connected" });
        if (m.msg !== "sub") return;
        opts.subs?.push({ name: m.name, params: m.params });
        if (m.name === opts.silentSub) return;
        if (m.name === opts.disconnectSub) return queueMicrotask(() => s.onclose?.());
        if (m.name === opts.failSub) return reply({ msg: "nosub", id: m.id, error: "denied" });
        let docs: readonly Doc[] = [];
        if (m.name === "articulos.genericos") docs = opts.genericDocs ?? catalogDocs;
        if (m.name === "subarticlesOfMany") docs = variantDocs.filter((d) => (m.params[0] as string[]).includes((d.fields as { GENERICO: string }).GENERICO));
        for (const d of docs) reply({ msg: "added", ...d });
        reply({ msg: "ready", subs: [m.id] });
        if (m.name === "articulos.genericos") opts.afterGenericReady?.(s);
      },
    };
    queueMicrotask(() => s.onopen?.());
    return s;
  };
}

const generics = "articulos.genericos";
const emptyMessage = "Masefer no devolvió productos válidos. No se modificó el catálogo.";
const invalidDocs = [
  { collection: "web_articulos", id: "missing-code", fields: { DENOMINACION: "Sin código" } },
  { collection: "web_articulos", id: "blank-code", fields: { GENERICO: "  ", DENOMINACION: "Sin código" } },
  { collection: "web_articulos", id: "missing-name", fields: { GENERICO: "INCOMPLETO" } },
];

function scriptedClient(attempts: ServerOptions[], options: { timeoutMs?: number; documentsSettleMs?: number } = {}) {
  const events: string[] = [];
  let index = 0;
  const client = new MaseferClient({
    settleMs: 0,
    productsWaitMs: 100,
    timeoutMs: 400,
    ...options,
    createSocket: () => {
      const n = ++index;
      events.push(`open ${n}`);
      return serverSocket({ ...attempts[n - 1], onClose: () => events.push(`close ${n}`) })();
    },
  });
  return { client, events };
}

async function withClock(test: () => Promise<void>) {
  vi.useFakeTimers();
  try {
    await test();
  } finally {
    vi.useRealTimers();
  }
}

describe("MaseferClient.fetchCatalog", () => {
  it("builds a full catalog over one connection, batching variants", async () => {
    const subs: { name: string; params: unknown[] }[] = [];
    const connections = { n: 0 };
    const client = new MaseferClient({ createSocket: serverSocket({ subs, connections }), settleMs: 0, variantBatchSize: 2, timeoutMs: 2000 });
    const catalog = await client.fetchCatalog();
    expect(catalog.products).toHaveLength(4);
    const sneakers = catalog.products.find((p) => p.code === "SNEAKPRO")!;
    expect(sneakers.variants).toHaveLength(5);
    expect(sneakers.images.large.length).toBeGreaterThan(0);
    expect(catalog.products.find((p) => p.code === "PAC25")!.documents).toHaveLength(2);
    expect(connections.n).toBe(1);
    expect(subs.filter((s) => s.name === "subarticlesOfMany")).toHaveLength(2);
  });

  it("waits past ready for valid products, ignores invalid rows, and subscribes to the resulting codes", () => withClock(async () => {
    const subs: NonNullable<ServerOptions["subs"]> = [];
    const { client, events } = scriptedClient([{
      subs,
      genericDocs: invalidDocs,
      afterGenericReady: (s) => setTimeout(() => {
        for (const d of catalogDocs) s.onmessage?.({ data: JSON.stringify({ msg: "added", ...d }) });
      }, 80),
    }]);
    const result = client.fetchCatalog().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(79);
    expect(subs.filter((s) => s.name === "subarticlesOfMany")).toEqual([]);
    await vi.advanceTimersByTimeAsync(21);
    expect(await result).toMatchObject({ products: expect.arrayContaining(catalogFixture.codes.map((code) => expect.objectContaining({ code }))) });
    expect(await result).toHaveProperty("products.length", catalogFixture.codes.length);
    const batches = subs.filter((s) => s.name === "subarticlesOfMany");
    expect(batches).toHaveLength(1);
    expect((batches[0].params[0] as string[]).sort()).toEqual([...catalogFixture.codes].sort());
    expect(events).toEqual(["open 1", "close 1"]);
  }));

  it.each([
    ["empty", { genericDocs: [] }],
    ["socket disconnect", { disconnectSub: generics }],
    ["missing variant ready", { silentSub: "subarticlesOfMany" }],
  ] as const)("retries a transient %s read on a fresh socket and returns the complete retry", (_, first) => withClock(async () => {
    const { client, events } = scriptedClient([first, {}]);
    const result = client.fetchCatalog().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(400);
    expect(await result).toMatchObject({ products: expect.arrayContaining(catalogFixture.codes.map((code) => expect.objectContaining({ code }))) });
    expect(events).toEqual(["open 1", "close 1", "open 2", "close 2"]);
  }));

  it("does not retry a rejected subscription", async () => {
    const { client, events } = scriptedClient([{ failSub: "marcas" }, {}]);
    await expect(client.fetchCatalog()).rejects.toMatchObject({ code: "subscription", message: 'Subscription "marcas" rejected: denied' });
    expect(events).toEqual(["open 1", "close 1"]);
  });

  it("does not swallow or retry a protocol error during the post-ready wait", () => withClock(async () => {
    const { client, events } = scriptedClient([{
      genericDocs: [],
      afterGenericReady: (s) => setTimeout(() => s.onmessage?.({ data: "!invalid json" }), 50),
    }, {}]);
    const result = client.fetchCatalog().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toMatchObject({ code: "protocol", message: "Invalid DDP message from Masefer" });
    expect(events).toEqual(["open 1", "close 1"]);
  }));

  it("bounds two stalled attempts by the original overall deadline", () => withClock(async () => {
    const stalled = { silentSub: generics };
    const { client, events } = scriptedClient([stalled, stalled, {}]);
    const done = vi.fn();
    const result = client.fetchCatalog().catch((error: unknown) => error).then(done);
    await vi.advanceTimersByTimeAsync(399);
    expect(events).toEqual(["open 1", "close 1", "open 2"]);
    expect(done).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toHaveBeenCalledWith(expect.objectContaining({ code: "timeout" }));
    await result;
    expect(events).toEqual(["open 1", "close 1", "open 2", "close 2"]);
  }));

  it("never returns a partial catalog when the document quiet window cannot finish", () => withClock(async () => {
    const { client, events } = scriptedClient([{}, {}], { documentsSettleMs: 500 });
    const result = client.fetchCatalog().catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(400);
    expect(await result).toMatchObject({ code: "timeout" });
    expect(events).toEqual(["open 1", "close 1", "open 2", "close 2"]);
  }));

  it("reports an exhausted invalid/empty read in the manual check and preserves the catalog", async () => {
    const ctx = await createPgliteDb();
    try {
      await migrate(ctx.db, { migrationsFolder: "./drizzle" });
      const { client, events } = scriptedClient([{ genericDocs: invalidDocs }, { genericDocs: [] }, {}], { timeoutMs: 2000 });
      const imageStore = { save: vi.fn(async () => "demo.jpg") };
      const seed = createSyncEngine({ db: ctx.db, source: new MaseferClient({ createSocket: serverSocket(), settleMs: 0 }), imageStore });
      await seed.apply((await seed.check("manual")).id);
      const snapshot = async () => ({
        products: await ctx.db.select().from(schema.sourceProducts).orderBy(schema.sourceProducts.code),
        variants: await ctx.db.select().from(schema.sourceVariants).orderBy(schema.sourceVariants.sku),
        overrides: await ctx.db.select().from(schema.productOverrides),
      });
      const before = await snapshot();
      expect(before.products).toHaveLength(4);
      expect(before.variants.length).toBeGreaterThan(0);
      imageStore.save.mockClear();
      const engine = createSyncEngine({ db: ctx.db, source: client, imageStore });
      await expect(runManualCheck({ engine })).resolves.toMatchObject({ ok: false, status: "failed", error: emptyMessage });
      expect((await engine.getLastRuns(1))[0]).toMatchObject({ status: "failed", error: emptyMessage, payload: null });
      expect(await snapshot()).toEqual(before);
      expect(imageStore.save).not.toHaveBeenCalled();
      expect(events).toEqual(["open 1", "close 1", "open 2", "close 2"]);
    } finally {
      await ctx.close();
    }
  });
});

describe("MaseferClient documents delivery", () => {
  it("waits for dropbox images and PDFs that stream in after ready", () => withClock(async () => {
    const pdf = { collection: "dropbox", id: "/web/catalogos/late.pdf", fields: { ownerId: "SNEAKPRO", name: "late.pdf", shortName: "ficha tecnica", ext: "pdf", source: "web", link: "https://www.dropbox.com/x/late.pdf?raw=1" } };
    const image = { collection: "dropbox", id: "/web/img500/late.jpg", fields: { ownerId: "SNEAKPRO", source: "web", link: "https://www.dropbox.com/x/late.jpg?raw=1" } };
    const { client, events } = scriptedClient([{
      afterGenericReady: (s) => setTimeout(() => {
        for (const doc of [pdf, image]) s.onmessage?.({ data: JSON.stringify({ msg: "added", ...doc }) });
      }, 60),
    }], { documentsSettleMs: 150, timeoutMs: 1000 });
    const result = client.fetchCatalog();
    await vi.advanceTimersByTimeAsync(300);
    const withWait = await result;
    const sneakers = withWait.products.find((p) => p.code === "SNEAKPRO")!;
    expect(sneakers.documents!.map((d) => d.label)).toEqual(["Ficha técnica"]);
    expect(sneakers.images.large).toContain(image.fields.link);
    expect(withWait.products.find((p) => p.code === "PAC25")!.documents).toHaveLength(2);
    expect(events).toEqual(["open 1", "close 1"]);
  }));
});
