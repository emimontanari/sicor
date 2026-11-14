/** Masefer public catalog client (Meteor DDP over raw WebSocket, no login). Node 22+ (global WebSocket). */
const WS_URL = "wss://www.masefer.com.ar/websocket";

export interface Category { metaCategoria: string; subfamilia: string }
export interface Variant { sku: string; color: string; idColor: number; size: string; text: string; stock: Record<string, number>; published: string }
export interface Article {
  code: string; name: string; description: string | null; brand: string; brandId: number;
  metaCategory: string; family: string; subfamily: string; type: string;
  price: number; currency: string; unit: string; priceLists: Record<string, number>;
  images: { small: string[]; large: string[] };
  variants?: Variant[];
}
type Doc = { collection: string; id: string; fields: any };

class DDP {
  private ws!: WebSocket; private docs: Doc[] = []; private waiters = new Map<string, () => void>(); private n = 0;
  async connect() {
    this.ws = new WebSocket(WS_URL);
    await new Promise<void>((res, rej) => {
      this.ws.onopen = () => { this.ws.send(JSON.stringify({ msg: "connect", version: "1", support: ["1"] })); };
      this.ws.onerror = () => rej(new Error("ws error"));
      this.ws.onmessage = (e) => {
        const o = JSON.parse(String(e.data));
        if (o.msg === "connected") res();
        else if (o.msg === "added") this.docs.push({ collection: o.collection, id: o.id, fields: o.fields });
        else if (o.msg === "ready") o.subs.forEach((s: string) => this.waiters.get(s)?.());
        else if (o.msg === "ping") this.ws.send(JSON.stringify({ msg: "pong" }));
      };
    });
  }
  /** Subscribe and wait until ready; returns docs received so far (all collections). */
  async sub(name: string, params: unknown[]): Promise<Doc[]> {
    const id = "s" + ++this.n;
    const ready = new Promise<void>((r) => this.waiters.set(id, r));
    this.ws.send(JSON.stringify({ msg: "sub", id, name, params }));
    await Promise.race([ready, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout " + name)), 60000))]);
    // docs can keep streaming after `ready`: wait until quiet
    let last = -1; const t0 = Date.now();
    while (this.docs.length !== last && Date.now() - t0 < 60000) { last = this.docs.length; await new Promise((r) => setTimeout(r, 1500)); }
    return this.docs;
  }
  close() { this.ws.close(); }
}

export class MaseferClient {
  private async run<T>(f: (d: DDP) => Promise<T>): Promise<T> {
    const d = new DDP(); await d.connect();
    try { return await f(d); } finally { d.close(); }
  }

  async listCategories(): Promise<{ metaCategories: string[]; categories: Category[] }> {
    return this.run(async (d) => {
      const docs = await d.sub("categorias", ["", "", false]);
      await d.sub("metacategorias", []);
      return {
        metaCategories: docs.filter((x) => x.collection === "web_metacategorias").map((x) => x.fields.nombre),
        categories: docs.filter((x) => x.collection === "web_categorias").map((x) => x.fields as Category),
      };
    });
  }

  async listBrands(): Promise<string[]> {
    return this.run(async (d) => (await d.sub("marcas", ["", "", "", false])).filter((x) => x.collection === "web_marcas").map((x) => x.fields.DESCRIPCION));
  }

  /** All articles (one per GENERICO). Optionally filter by metacategory name (e.g. "Calzado"). */
  async listArticles(metaCategory = "", withVariants = false): Promise<Article[]> {
    return this.run(async (d) => {
      const docs = await d.sub("articulos.genericos", [metaCategory, "", "", 100000, "", false]);
      const img = new Map<string, { small: string[]; large: string[] }>();
      for (const x of docs) if (x.collection === "dropbox" && x.fields.source === "web") {
        const m = /^\/web\/img(200|500)\//.exec(x.id); if (!m) continue;
        const e = img.get(x.fields.ownerId) ?? { small: [], large: [] };
        (m[1] === "200" ? e.small : e.large).push(x.fields.link);
        img.set(x.fields.ownerId, e);
      }
      const by = new Map<string, Article>();
      for (const x of docs) if (x.collection === "web_articulos") {
        const f = x.fields; const key = f.GENERICO;
        let a = by.get(key);
        if (!a) {
          a = { code: key, name: f.DENOMINACION, description: null, brand: f.MARCA, brandId: f.MARCAS_ID, metaCategory: f.METACATEGORIA,
            family: f.FAMILIA, subfamily: f.SUBFAMILIA, type: f.TIPOARTICULO, price: f.PRECIO, currency: f.NOMBRE_MONEDA, unit: f.UMEDIDA,
            priceLists: {}, images: img.get(key) ?? { small: [], large: [] } };
          by.set(key, a);
        }
        a.priceLists[String(f.PRECIOS_ID)] = f.PRECIO;
        if (f.PRECIOS_ID === 5) a.price = f.PRECIO;
      }
      const arts = [...by.values()];
      if (withVariants) for (const a of arts) a.variants = await this.getVariants(a.code);
      return arts;
    });
  }

  /** Variants (color/size/stock) for a GENERICO code. */
  async getVariants(code: string): Promise<Variant[]> {
    return this.run(async (d) => (await d.sub("subarticlesWithUniques", [code])).filter((x) => x.collection === "subarticulos" && x.fields.GENERICO === code)
      .map((x) => ({ sku: x.fields.ARTICULO, color: x.fields.COLOR, idColor: x.fields.IDCOLOR, size: x.fields.TALLE, text: x.fields.TEXTO, stock: x.fields.stock, published: x.fields.PUBLICA_WEB })));
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const c = new MaseferClient();
  const cats = await c.listCategories();
  console.log("metacategories:", cats.metaCategories, "categories:", cats.categories.length);
  console.log("brands:", (await c.listBrands()).length);
  const arts = await c.listArticles();
  console.log("articles:", arts.length);
  const a = arts.find((x) => x.code === "SNEAKPRO") ?? arts[0];
  a.variants = await c.getVariants(a.code);
  console.log(JSON.stringify(a, null, 1).slice(0, 1800), "\nvariants:", a.variants.length);
}
