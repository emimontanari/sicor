# Feature: catalog-sync (Phase 1 — app scaffold, Masefer sync and data)

Phase 1 of `docs/idea.md`: scaffold the single app deployed on Dokploy, turn the Phase 0 spike client into a tested Masefer module, create the database schema and the sync engine (check → pending notice → apply on admin confirm). Public catalog (Phase 2) and dashboard UI (Phase 3) are out of scope here.

## Specs

- **S1 — Source of products.** All products come from the supplier through the tool's generated client (L2: "siempre que obtenga mediente esa herramienta todos los productos de ese provedor"). Source: Masefer public catalog over DDP `wss://www.masefer.com.ar/websocket`, no login (L6/L7). Reference client: `spike/rae/scripts/e1d689cd924c/api_client.ts`.
- **S2 — Client edits are never overwritten.** The client can hide/show, rename, change price, show/hide price and change images (L1: "ocultar productos, cambiar, ocultar precios, mostrar precios, cambiar precios, cambiar imágenes"). These live in a separate overrides store; sync never writes to it.
- **S3 — Sync cadence.** L4: "semanal 15 days, not more than this" and "there's a button that would have manual with an aviso". A scheduled check runs every 15 days; a manual check can run anytime (button UI is Phase 3; Phase 1 provides the callable check).
- **S4 — Check never applies; admin confirms.** L4: "subieron three product nuevos, quieres actualizar y el admin, si quieres actualizar, and if no, the synchronization." L5: "todo en el dashbaord del admin". Both scheduled and manual checks only compute and store a pending-changes summary (new / changed / removed counts and items). Changes are applied only by an explicit apply of that pending run; discarding it changes nothing.
- **S5 — New and removed products.** New supplier products enter hidden ("to review") unless the `auto_publish_new` setting is on. Products removed by the supplier are hidden and flagged discontinued, never deleted.
- **S6 — Images.** Supplier images (Dropbox links) are copied into the app's own storage on apply; the catalog never hotlinks Masefer/Dropbox.
- **S7 — Failures.** A failed check or apply is recorded for the admin dashboard (L5) and leaves the last good catalog data unchanged (apply is atomic).
- **S8 — Deploy.** L8: "el deploy lo vamos a hacer en dockploy ahi va estar toda la app cpmplemta". The whole app (Next.js, Postgres, image storage, scheduled check) runs on Dokploy; no Supabase/Vercel.
- **S9 — Quote-only, single supplier.** Catalog is quote-only ("Consultar cotización"); supplier price is stored but never public by default. Single supplier for MVP.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S8 | Scaffold Next.js + TypeScript + Drizzle (Postgres prod, PGlite tests) + Vitest, Dockerfile + docker-compose for Dokploy, `.env.example`, `.gitignore`; update `docs/idea.md` §7 stack to Dokploy | gentle-ai-worker | done (gaps: `.env.example` blocked by write policy; `.gitignore` `scripts/` hid `spike/rae/scripts/`, fixed in 92b47fc) | e37f584 |
| T2 | S1, S9 | Masefer module `src/server/masefer/`: DDP client adapted from spike, normalized types, fixture-based unit tests, live smoke script | gentle-ai-worker | done | 7222da9 |
| T3 | S2, S5, S9 | DB schema + migrations: categories (SICOR 7 seeded), source products/variants, overrides, category mappings, settings, sync runs + pending changes | gentle-ai-worker | done | 5f528cc |
| T4 | S2, S4, S5, S6, S7 | Sync engine: `check()` → pending run; `apply(runId)` atomic; `discard(runId)`; image copy; tests on PGlite with fake client | gentle-ai-worker | done, independent verify pending (Risk: items 1, 4) | b6c2bab |
| T5 | S3, S7, S8 | Entrypoints: `pnpm sync:check` for the Dokploy 15-day scheduled job, README + `docs/deploy-dokploy.md` | gentle-ai-worker | pending | |

## Log

- **L1** (original request): "Mira, te cuento lo que quiero hacer. Más que todo para generar la idea y ya tenerla documentada la idea. Pero lo que quiero hacer es, el catálogo este PDF que te estoy brindando, la quiero hacer una página web. Y a la información quiero usar ese repo que te brindo para tomar la información de la página que está también ahí para poder hacer un catálogo online responsive para celular con un dashboard administrativo para ocultar productos, cambiar, ocultar precios, mostrar precios, cambiar precios, cambiar imágenes, mostrar esto, mostrar. Pero en base a que los productos salgan de esa página mediante este repo y en base yo mostrar los que quiero, los que no quiero y cuando se actualicen tener siempre actualizado. Quiero que me digas tu opinión"
- **L2**: "La idea es la siguiente te la paso en limpio por que es mas simple de lo que pensas es un pagina catalogo principalmente para mobile por que se va a brindar por whatapp siempre que obtenga mediente esa herramienta todos los productos de ese provedor y nosotros tener un dashboard privado para una solo usario que es el cliente puede modificar los precios, nombres, ocultar modifcar etc y mas adelante hacer mas cosas de dashboard administrativo, por que lo principal es el catalogo"
- **L3**: "\"Consultar cotización\" y se van a agregar a un carrtio y el carrtio se manda por whatapp con un mensaje con la api de whatapp simple como usa en todos lados y estaria bueno que cuando haya una actualizacion de masefer, se haga automatico"
- **L4**: "no una frecuencia semanalOh I think what you pensé is that there would have been a bottom of synchronization that you think che, no sé, subieron three product nuevos, quieres actualizar y el admin, si quieres actualizar, and if no, the synchronization. semanal 15 days, not more than this. But propongo del button, that is 15 days of synchronization and there's a button that would have manual with an aviso."
- **L5**: "todo en el dashbaord del admin"
- **L6**: "pero apra sincro no podemos usar la herramienta que te brinde? hacerlo direcramiente https://www.masefer.com.ar/" → "dale"
- **L7**: Phase 0 evidence: generated client ran twice live: 4 metacategories, 48 categories, 30 brands, 551 articles, no login; `articles.web.one` returns nothing publicly; no description field; images are Dropbox links.
- **L8**: "dale" (start Phase 1) → "dale perfecto, el deploy lo vamos a hacer en dockploy ahi va estar toda la app cpmplemta"
- **L10** (evidence): T1 checks — `pnpm test` 1/1 pass (parent re-ran); typecheck/build/lint pass per worker; Dockerfile/compose not built (Docker daemon down).
- **L9** (decision, parent): stack = Next.js (App Router, TypeScript, pnpm) + Postgres on Dokploy via Drizzle ORM (PGlite for tests, no Docker needed locally) + images on a mounted volume served by the app + Vitest. Local Docker daemon (colima) is not running.
- **L11** (evidence): T2 — 16 masefer tests, live smoke 551 products / 3915 variants in ~5 s via batched `subarticlesOfMany`. T3 — schema + migration 0000, idempotent `seedCategories`, `effectiveVisibility` (reviewed + visible null = shown, worker choice). Parent re-ran `pnpm test` 26/26 and typecheck OK.
- **L12** (evidence): T4 — engine with `payload` snapshot column (migration 0001), claim-first apply guard; parent re-ran `pnpm vitest run tests/sync` 16/16; sync code has 0 references to `productOverrides`. Zero-change checks end as `discarded` with zero summary.
