# Masefer public catalog client
Meteor DDP over raw WebSocket `wss://www.masefer.com.ar/websocket` (no auth, no cookies). Node 22+.
Run: `npm install && npx tsx api_client.ts`

Subscriptions used: `categorias(["","",false])`, `metacategorias`, `marcas(["","","",false])`,
`articulos.genericos([meta,"","",limit,"",false])` (collections `web_articulos` per price list, `dropbox` images: /web/img200 & img500 keyed by ownerId = GENERICO),
`subarticlesWithUniques([GENERICO])` (collection `subarticulos`: color, size, stock).
Caveats: no free-text description field is published (description is null; name is DENOMINACION). `articles.web.one` returned no data publicly.
Product page URL is /articulo/<GENERICO>.
