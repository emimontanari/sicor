import { DdpConnection, type DdpSocket } from "./ddp";
import { MaseferSyncError } from "./errors";
import { mapCatalog, productCode } from "./mapping";
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
  /** Grace window when no valid products are present after ready. Default 2000ms, clipped by the attempt deadline. */
  productsWaitMs?: number;
  /**
   * Final quiet window (ms) after every subscription is ready, before mapping. Masefer streams the
   * `dropbox` documents (images + `/web/catalogos` PDFs) after `ready`, so the catalog is only
   * mapped once the document store stopped growing for this long. Default 1500; 0 when `settleMs` is 0.
   */
  documentsSettleMs?: number;
  createSocket?: (url: string) => DdpSocket;
}

const emptyRead = () => new MaseferSyncError("empty", "Masefer no devolvió productos válidos. No se modificó el catálogo.");

/** Production Masefer source: one DDP connection per attempt, at most one retry, one overall deadline. */
export class MaseferClient implements MaseferSource {
  constructor(private opts: MaseferClientOptions = {}) {}

  async fetchCatalog(): Promise<SupplierCatalog> {
    const budget = this.opts.timeoutMs ?? 120_000;
    const start = Date.now();
    const deadline = start + budget;
    // Reserve time for a fresh connection even if the first attempt stalls until its deadline.
    try {
      return await this.readAttempt(start + Math.ceil(budget * 0.75));
    } catch (e) {
      if (!(e instanceof MaseferSyncError) || !["connect", "timeout", "empty"].includes(e.code) || Date.now() >= deadline) throw e;
      return this.readAttempt(deadline);
    }
  }

  private async readAttempt(deadline: number): Promise<SupplierCatalog> {
    const { opts } = this;
    let conn: DdpConnection | undefined;
    try {
      conn = await DdpConnection.open({
        url: opts.url ?? MASEFER_WS_URL,
        timeoutMs: deadline - Date.now(),
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
      const productCodes = () => [...new Set(c.docs().map(productCode).filter((code) => code !== undefined))];
      let codes = productCodes();
      if (codes.length === 0) {
        // Give late generic rows a fixed window rather than proceeding on the first row of a burst.
        await c.collectFor(opts.productsWaitMs ?? 2000);
        codes = productCodes();
        if (codes.length === 0) throw emptyRead();
      }

      const size = Math.max(1, opts.variantBatchSize ?? 50);
      const subscribed = new Set<string>();
      do {
        const batches: string[][] = [];
        for (let i = 0; i < codes.length; i += size) batches.push(codes.slice(i, i + size));
        let next = 0;
        const worker = async () => {
          while (next < batches.length) await c.subscribe("subarticlesOfMany", [batches[next++]]);
        };
        const concurrency = Math.min(Math.max(1, opts.variantConcurrency ?? 4), batches.length);
        await Promise.all(Array.from({ length: concurrency }, worker));
        for (const code of codes) subscribed.add(code);

        // Images and PDFs can arrive after ready. Pick up any additional generic codes too.
        await c.settle(opts.documentsSettleMs ?? (opts.settleMs === 0 ? 0 : 1500));
        codes = productCodes().filter((code) => !subscribed.has(code));
      } while (codes.length > 0);

      const catalog = mapCatalog(c.docs());
      if (catalog.products.length === 0) throw emptyRead();
      return catalog;
    } catch (e) {
      if (e instanceof MaseferSyncError) throw e;
      throw new MaseferSyncError("protocol", `Masefer catalog fetch failed: ${e instanceof Error ? e.message : String(e)}`, { cause: e });
    } finally {
      conn?.close();
    }
  }
}
