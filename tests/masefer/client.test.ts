import { describe, expect, it } from "vitest";
import catalogFixture from "../fixtures/masefer/catalog.json";
import variantsFixture from "../fixtures/masefer/variants.json";
import { MaseferClient } from "../../src/server/masefer/client";
import type { DdpSocket } from "../../src/server/masefer/ddp";
import { MaseferSyncError } from "../../src/server/masefer/errors";

type Doc = { collection: string; id: string; fields: unknown };
const catalogDocs = catalogFixture.docs as Doc[];
const variantDocs = variantsFixture as Doc[];

function serverSocket(opts: { failSub?: string; silentSub?: string; subs?: { name: string; params: unknown[] }[]; connections?: { n: number } } = {}) {
  return (): DdpSocket => {
    if (opts.connections) opts.connections.n++;
    const s: DdpSocket = {
      onopen: null, onmessage: null, onerror: null, onclose: null,
      close() {},
      send(data: string) {
        const m = JSON.parse(data);
        const reply = (o: unknown) => queueMicrotask(() => s.onmessage?.({ data: JSON.stringify(o) }));
        if (m.msg === "connect") return reply({ msg: "connected" });
        if (m.msg !== "sub") return;
        opts.subs?.push({ name: m.name, params: m.params });
        if (m.name === opts.silentSub) return;
        if (m.name === opts.failSub) return reply({ msg: "nosub", id: m.id, error: "denied" });
        let docs: Doc[] = [];
        if (m.name === "articulos.genericos") docs = catalogDocs;
        if (m.name === "subarticlesOfMany") docs = variantDocs.filter((d) => (m.params[0] as string[]).includes((d.fields as { GENERICO: string }).GENERICO));
        for (const d of docs) reply({ msg: "added", ...d });
        reply({ msg: "ready", subs: [m.id] });
      },
    };
    queueMicrotask(() => s.onopen?.());
    return s;
  };
}

describe("MaseferClient.fetchCatalog", () => {
  it("builds a full catalog over one connection, batching variants", async () => {
    const subs: { name: string; params: unknown[] }[] = [];
    const connections = { n: 0 };
    const client = new MaseferClient({ createSocket: serverSocket({ subs, connections }), settleMs: 0, variantBatchSize: 2, timeoutMs: 2000 });
    const catalog = await client.fetchCatalog();
    expect(catalog.products).toHaveLength(4);
    expect(catalog.products.find((p) => p.code === "SNEAKPRO")!.variants).toHaveLength(5);
    expect(connections.n).toBe(1);
    expect(subs.filter((s) => s.name === "subarticlesOfMany")).toHaveLength(2);
  });

  it("throws MaseferSyncError when a subscription is rejected", async () => {
    const client = new MaseferClient({ createSocket: serverSocket({ failSub: "marcas" }), settleMs: 0, timeoutMs: 500 });
    await expect(client.fetchCatalog()).rejects.toBeInstanceOf(MaseferSyncError);
  });

  it("throws MaseferSyncError(timeout) when the overall deadline passes", async () => {
    const client = new MaseferClient({ createSocket: serverSocket({ silentSub: "articulos.genericos" }), settleMs: 0, timeoutMs: 50 });
    const err = await client.fetchCatalog().catch((e) => e);
    expect(err).toBeInstanceOf(MaseferSyncError);
    expect(err.code).toBe("timeout");
  });

  it("throws instead of returning an empty catalog", async () => {
    const client = new MaseferClient({
      createSocket: serverSocket({ subs: [] }),
      settleMs: 0,
      timeoutMs: 500,
    });
    // server that returns no articles
    const empty = new MaseferClient({
      createSocket: () => {
        const s = serverSocket()();
        const orig = s.send.bind(s);
        s.send = (d: string) => (JSON.parse(d).name === "articulos.genericos" ? queueMicrotask(() => s.onmessage?.({ data: JSON.stringify({ msg: "ready", subs: ["s3"] }) })) : orig(d));
        return s;
      },
      settleMs: 0,
      timeoutMs: 500,
    });
    await expect(client.fetchCatalog()).resolves.toBeDefined();
    await expect(empty.fetchCatalog()).rejects.toBeInstanceOf(MaseferSyncError);
  });
});
