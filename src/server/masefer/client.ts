import { DdpConnection, type DdpSocket } from "./ddp";
import { MaseferSyncError } from "./errors";
import { mapCatalog } from "./mapping";
import type { MaseferSource, SupplierCatalog } from "./types";

export const MASEFER_WS_URL = "wss://www.masefer.com.ar/websocket";

export interface MaseferClientOptions {
  url?: string;
  /** Bounded overall time for the whole catalog fetch. Default 120s. */
  timeoutMs?: number;
  /** Product codes per `subarticlesOfMany` subscription. Default 50. */
  variantBatchSize?: number;
  /** Concurrent variant subscriptions on the single connection. Default 4. */
  variantConcurrency?: number;
  settleMs?: number;
  createSocket?: (url: string) => DdpSocket;
}

/** Production Masefer source: one DDP connection, batched variant subscriptions, one overall deadline. */
export class MaseferClient implements MaseferSource {
  constructor(private opts: MaseferClientOptions = {}) {}

  async fetchCatalog(): Promise<SupplierCatalog> {
    const { opts } = this;
    let conn: DdpConnection | undefined;
    try {
      conn = await DdpConnection.open({
        url: opts.url ?? MASEFER_WS_URL,
        timeoutMs: opts.timeoutMs ?? 120_000,
        settleMs: opts.settleMs,
        createSocket: opts.createSocket,
      });
      const c = conn;
      await Promise.all([
        c.subscribe("categorias", ["", "", false]),
        c.subscribe("metacategorias", []),
        c.subscribe("marcas", ["", "", "", false]),
        c.subscribe("articulos.genericos", ["", "", "", 100000, "", false]),
      ]);
      const codes = [...new Set(c.docs().filter((d) => d.collection === "web_articulos").map((d) => d.fields.GENERICO as string))];
      if (codes.length === 0) throw new MaseferSyncError("empty", "Masefer returned no products");

      const size = Math.max(1, opts.variantBatchSize ?? 50);
      const batches: string[][] = [];
      for (let i = 0; i < codes.length; i += size) batches.push(codes.slice(i, i + size));
      let next = 0;
      const worker = async () => {
        while (next < batches.length) await c.subscribe("subarticlesOfMany", [batches[next++]]);
      };
      await Promise.all(Array.from({ length: Math.min(opts.variantConcurrency ?? 4, batches.length) }, worker));

      return mapCatalog(c.docs());
    } catch (e) {
      if (e instanceof MaseferSyncError) throw e;
      throw new MaseferSyncError("protocol", `Masefer catalog fetch failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    } finally {
      conn?.close();
    }
  }
}
