# SICOR Online Catalog — Idea

> Status: idea / pre-planning. Items marked **(proposal)** are suggestions, not decisions.

## 1. Summary

- **What:** turn SICOR's 14-page Canva PDF catalog ("CATÁLOGO COMERCIAL | SICOR — Soluciones para la industria, el trabajo y la seguridad") into a website.
- **For whom:** SICOR (Suministros Industriales Córdoba) and its customers.
- **How it is shared:** a link sent via **WhatsApp**. Customers open it on their phone, so the site is **mobile-first**.
- **Where the products come from:** the single supplier, **Masefer** (its **public catalog** at `https://www.masefer.com.ar/`: no login, no SICOR credentials). Products are pulled automatically with a sync tool instead of being typed by hand.
- **How customers ask:** every product is quote-only ("Consultar cotización"). Customers add products to a **quote cart** and send it to SICOR through a WhatsApp click-to-chat link.
- **Control:** a **private dashboard for one user (the client)** to edit names, prices, visibility, etc.
- **Priority:** the **catalog is the core**. Dashboard features beyond the basics come later.

## 2. Goals / Non-goals

**Goals (MVP)**
- Public, fast, mobile-first catalog with the PDF's 7 categories.
- Products obtained automatically from Masefer and kept up to date: a check **every 15 days** plus a manual "Check for updates" button. Both leave a notice in the admin dashboard, and changes apply only when the admin confirms.
- Quote cart sent via WhatsApp (simple `wa.me` link, no account, no payment).
- Single-user private dashboard: hide/show products, edit names and prices, show/hide prices.

**Later**
- More admin-dashboard features (to be defined).

**Non-goals (MVP)**
- Online payments or checkout (the quote cart only sends a WhatsApp message).
- Multiple suppliers.
- Multiple admin users or roles.

## 3. How it works

```
 Masefer public catalog (no login)
        |
        v
 Sync  (generated API client)
  - scheduled: check every 15 days
  - manual: "Check for updates" button
  - both: pending-updates notice in the
    dashboard, applied only on admin confirm
        |
        v
 +-----------------+      +------------------+
 | source_products |      |    overrides     |
 | (overwritten by |      | (client edits;   |
 |  every sync)    |      |  never touched   |
 |                 |      |  by the sync)    |
 +--------+--------+      +--------+---------+
          \                       /
           \                     /
            v                   v
           EFFECTIVE PRODUCT = source + overrides
                  |                    |
                  v                    v
           Public catalog         Admin dashboard
          (mobile, quote-only)    (single user, settings)
                  |
                  v
        Quote cart (localStorage)
                  |
                  v
   wa.me/<number>?text=<message>  -->  WhatsApp
```

**Key design decision: source vs. overrides are separate.**
- The sync only writes `source_products`; it can overwrite freely.
- The client's edits live only in `overrides`; the sync never touches them.
- The effective product = override value if present, otherwise the source value.
- Result: supplier updates flow in without erasing the client's changes, and removing an override reverts to the supplier data.

## 4. Public catalog

- Mobile-first, responsive; fast load; shareable links (per category and per product).
- **Quote-only by default:** no public prices; every product shows **"Consultar cotización"**.
- Categories from the PDF:
  1. Indumentaria laboral
  2. Calzado de seguridad
  3. Elementos de protección personal
  4. Protección ocular y auditiva
  5. Guantes de protección
  6. Seguridad vial
  7. Productos destacados
- Search across products.
- Product card: image, name, notes (e.g. "Compre este producto por PACK de 10 y agilice la entrega", "Este producto tiene demora en algunas variantes de talle/color"), "Consultar cotización" and an **Add to quote** button.
- Prices can be shown later only if the client enables them in the dashboard (optional, off by default).
- Hidden products never appear.

**Quote cart (MVP)**
- Customer adds products with **quantity** and, where applicable, a **size/variant note**.
- Cart lives **client-side in localStorage**; no account or login.
- **"Send via WhatsApp"** opens `https://wa.me/<number>?text=<urlencoded message>`: the simple click-to-chat link, **no WhatsApp Business API**.
- The prefilled message lists products and quantities (plus variant notes), built from the configurable template.
- The WhatsApp number is configurable in the dashboard.

## 5. Admin dashboard

Single-user login (the client). Private.

**Per product**
- Hide / show.
- Rename.
- Change price.
- Show / hide price.
- Replace image.
- Edit description and category.

**Workflow**
- **Bulk actions:** hide/show, show/hide prices, change category for many products.
- **New products:** everything synced from the supplier is published automatically; hiding is a manual, explicit decision (per product, in bulk, or by category).
- **Settings:** WhatsApp number, message template, optional public price display.
- **Discontinued products:** auto-hidden and flagged when they disappear from the supplier.
- **Pending-updates notice:** shown in the dashboard after the 15-day scheduled check or the manual check, e.g. "Masefer added 3 new, 5 changed, 2 removed — update now?". Confirm applies the changes; cancel (or ignoring it) changes nothing.
- **"Check for updates" button:** usable anytime; runs the check without applying and produces the same notice.
- **Sync failure alerts:** shown in the dashboard (no email or other channel for the MVP); the catalog keeps the last good data.
- **Last sync status:** when it ran (scheduled or manual), success/failure, counts of new/changed/removed.

## 6. Data model sketch

| Table | Key fields |
|---|---|
| `source_products` | `supplier_id`, `name`, `description`, `supplier_price` (public price list 5, PESOS; not shown in the MVP), `unit`, `family`, `subfamily`, `variants` (color / size / stock), `image_url`, `supplier_category`, `raw` (original payload), `first_seen_at`, `last_seen_at`, `discontinued` |
| `overrides` | `source_product_id`, nullable: `name`, `description`, `price`, `image_path`, `category_id`; `hidden`, `price_hidden`, `reviewed`, `updated_at` |
| `categories` | `id`, `name`, `slug`, `sort_order`, `visible` |
| `sync_runs` | `id`, `started_at`, `finished_at`, `status`, `new_count`, `changed_count`, `removed_count`, `trigger` (scheduled / manual), `applied`, `error` |
| `settings` | `whatsapp_number`, `message_template`, `auto_publish_new`, `show_prices` (default off) |

- **Supplier prices are never exposed publicly by default** (the catalog is quote-only). The public catalog reads only the effective, client-set price (or none).
- The public view should expose only effective fields (e.g. a database view), not the raw tables.

## 6b. Sync and updates (proposal)

- Masefer has **no webhook** to us, so updates are detected by polling its **public catalog**.
- **Source (L6):** `https://www.masefer.com.ar/`, no login. Public routes found in the site's JS bundle: `/categoria/:categoria`, `/articulo/:articulo`, `/marca/:marca` (HTTP 200 without login).
- **Verified in Phase 0 (L7):** data arrives over Meteor **DDP on a raw WebSocket** (`wss://www.masefer.com.ar/websocket`), with **no login and no cookies**.
- Publications that work publicly: `categorias`, `metacategorias`, `marcas`, `articulos.genericos` (collection `web_articulos`, plus `dropbox` images img200/img500) and `subarticlesWithUniques` (collection `subarticulos`: color, size, stock). `articles.web.one` returns nothing publicly.
- Fields available: code, name, brand, metaCategory, family, subfamily, unit, images (small/large), variants, and a public price (price list 5, PESOS). **No free-text description** is published (null).
- Size of the source: 4 metacategories (Calzado, Indumentaria, Seguridad Industrial, Seguridad Vial), 48 categories, 30 brands, **551 articles** (the PDF has ~37 products). Example: "ZAPATILLA SNEAKER PRO COMPOSITE", brand OMBU, 39 variants.
- **Curation is essential:** new products stay hidden by default; suggested **initial import publishes only the PDF's products**.
- **Images** are Dropbox links: copy them into our own storage on sync.
- **Descriptions** must be authored in the dashboard if wanted.
- **Categories:** map Masefer metacategories/families to SICOR's 7 PDF categories in the dashboard.
- Public price and stock exist and could later feed optional prices or "stock/demora" badges (out of MVP; the catalog stays quote-only).
- A logged-in source is not needed.
- **Scheduled check every 15 days** (never longer than 15 days between checks). It does **not** apply changes: it leaves a pending-updates notice in the admin dashboard.
- **Manual "Check for updates" button** in the dashboard, usable anytime:
  1. Runs a check against Masefer **without applying** anything.
  2. Shows the same notice summarizing changes (new / changed / removed).
  3. Admin **confirms** (apply) or **cancels** (nothing changes).
- Changes are applied **only when the admin confirms**, whether the check was scheduled or manual.
- Both paths use the same **change detection**: new / changed / removed products.
- Client overrides are never touched.
- New products are **published automatically** when the sync is applied; the client only hides what they do not want to show (a manual, explicit decision).
- Removed products are auto-hidden and flagged.
- On failure: an **alert in the admin dashboard** (no email for the MVP); the catalog **keeps the last good data**.

## 7. Suggested stack

Decided in L8/L9: a single app deployed entirely on **Dokploy** with docker-compose.

- **Next.js** (App Router, TypeScript, pnpm) for catalog and dashboard, built with `output: "standalone"`.
- **Postgres** with **Drizzle ORM** (migrations via drizzle-kit); tests run on PGlite, so no Docker is needed locally.
- **Images** copied on sync into a mounted volume (`IMAGES_DIR=/app/data/images`) and served by the app.
- **Dashboard auth:** single user, handled by the app itself (Phase 3).
- **Scheduled check every 15 days:** a Dokploy scheduled job runs the check command. The manual check runs on demand from the dashboard.
- **Sync client:** TypeScript client generated with [reverse-api-engineer](https://github.com/kalil0321/reverse-api-engineer) (RAE), run against the **public** Masefer site.
  - RAE captures browser traffic (HAR) and generates a typed API client.
  - It is a **dev-time tool, used once**; the generated client is what runs on the schedule.

## 8. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Masefer is a **Meteor app**; data travels over **DDP WebSocket**, not REST. RAE's Playwright HAR may not include WebSocket frames, and chrome-mcp mode saves no HAR. | **Mitigated by Phase 0:** RAE generated a working client over the raw WebSocket; no hand-written DDP client needed. |
| 551 supplier articles vs ~37 in the PDF; unwanted products could appear. | New products hidden by default; initial import publishes only the PDF's products. |
| Supplier terms of service. | **Ask Masefer first** whether they offer an Excel, feed or API. |
| Sync breaks when the supplier changes. | Failure alert in the dashboard; keep the last good data; Excel import as fallback. |
| Supplier images are Dropbox links and may disappear or be hotlink-blocked. | Copy images to our own storage on sync. |

## 9. Phases

- **Phase 0 — Spike: DONE (2026-11-14).** RAE (agent mode, provider `auto`, Claude Sonnet 5.5, TypeScript, ~3.5 min, USD 0.29) generated a working client at `spike/rae/scripts/e1d689cd924c/api_client.ts` (113 lines, no runtime deps, Node 22 built-in WebSocket; run `npx tsx api_client.ts`). Run twice successfully. RAE approach confirmed; no hand-written DDP client needed.
- **Phase 1 — Sync + data:** adapt the generated client, schema, scheduled sync (every 15 days), `sync_runs`.
- **Phase 2 — Public catalog:** categories, search, product cards (quote-only), quote cart in localStorage, `wa.me` send button.
- **Phase 3 — Dashboard:** login, per-product edits, bulk actions, sync status, settings (WhatsApp number, message template), pending-updates notice (from the 15-day check or the manual "Check for updates" button) with confirm/cancel, and sync failure alerts.
- Phase 1 includes the 15-day scheduled check and change detection (check and apply as separate steps; the scheduled check never applies, the dashboard confirms).
- **Later:** more admin-dashboard features.

## 10. Open questions

- Domain and hosting?
- (Optional) Does Masefer offer an official feed, Excel export or API? Not required, since the public DDP source works.
- Which of the 551 articles are the PDF's ~37 products (to define the initial import)?

Next step: Phase 1 (sync + data).

## Decision log

- **2026-11-14 (L2):** single private dashboard user (the client); mobile-first catalog shared via WhatsApp; the catalog is the priority, more dashboard features later.
- **2026-11-14 (L3):** quote-only by default ("Consultar cotización", no public prices); quote cart in the MVP, sent via a simple `wa.me` link (no Business API); Masefer updates via scheduled polling, with auto-publish as a dashboard setting (automatic apply later superseded by L5).
- **2026-11-14 (L4):** the sync frequency is **every 15 days** (never longer), replacing the hourly proposal. A manual **"Check for updates" button** is added: it previews the changes with a notice and applies them only if the admin confirms.
- **2026-11-14 (L5):** everything is managed in the admin dashboard. The 15-day scheduled check does **not** auto-apply: it leaves the same pending-updates notice and changes apply only on admin confirmation. Sync failure alerts are shown in the dashboard (no email for the MVP); the catalog keeps the last good data.
- **2026-11-14 (L6):** the sync source is Masefer's **public catalog** (`https://www.masefer.com.ar/`, no login, no SICOR credentials), since the catalog is quote-only and needs no prices. Plan: use RAE against the public site to generate the TypeScript client; fallback is a small hand-written DDP client using the publication names found in the bundle. Whether those publications return data without login is unverified; Phase 0 validates it. *(Resolved by L7.)*
- **2026-11-14 (L7):** Phase 0 result ("dale" → RAE run succeeded against the public site). The generated client works with no login over the raw DDP WebSocket and returned 4 metacategories, 48 categories, 30 brands and 551 articles. RAE approach confirmed, no hand-written DDP client needed. Curation is essential (551 vs ~37 in the PDF), so the initial import publishes only the PDF's products; images are copied to our own storage; descriptions are authored in the dashboard; public price/stock are available for possible later use but the catalog stays quote-only.
- **2026-11-14 (L8):** deploy on Dokploy; the whole app (Next.js, Postgres, image storage, scheduled check) runs there with docker-compose. No Supabase, Vercel or GitHub Actions.
