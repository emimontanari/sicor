# Feature: admin-dashboard (Phase 3 — single-user private dashboard)

Phase 3 of `docs/idea.md`, on top of Phase 1 (`odd/tasks/catalog-sync.md`: sync engine check/apply/discard, schema) and Phase 2 (`odd/tasks/public-catalog.md`: storefront read model, cart). One private admin user (the client) curates the catalog and handles Masefer updates.

## Specs

- **S1 — Single private user.** L2: "nosotros tener un dashboard privado para una solo usario que es el cliente". Login with one account configured by env (`ADMIN_EMAIL`, `ADMIN_PASSWORD_HASH` scrypt, `SESSION_SECRET`); HttpOnly signed session cookie; every admin page AND every admin mutation re-checks the session server-side; login rate-limited; logout.
- **S2 — Edit products.** L1: "ocultar productos, cambiar, ocultar precios, mostrar precios, cambiar precios, cambiar imágenes, mostrar esto, mostrar". L2: "puede modificar los precios, nombres, ocultar modifcar etc". Per product: visible on/off, custom name, custom description/note, custom price, show price, category, custom image (upload, validated image, stored under IMAGES_DIR) or reset to supplier image. Edits go only to `product_overrides`; supplier data is read-only in the UI. Bulk: show/hide, set category, mark reviewed.
- **S3 — Product list.** All supplier products (551) searchable and filterable: visible / hidden / new to review / discontinued / by category; paginated; mobile-usable.
- **S4 — New products to review.** New supplier products enter hidden ("Nuevos para revisar") unless `auto_publish_new`; the admin publishes or dismisses (reviewed) them.
- **S5 — Masefer updates in the dashboard.** L4: "subieron three product nuevos, quieres actualizar y el admin, si quieres actualizar, and if no". L5: "todo en el dashbaord del admin". Pending-updates notice ("Masefer agregó N nuevos, N cambiaron, N se dieron de baja — ¿Actualizar?") with item details and image warnings; Confirm → apply; Cancel → discard. Manual "Buscar actualizaciones" button runs check("manual"). Failed runs shown as an alert; last runs history.
- **S6 — Settings.** WhatsApp number (digits), message template, auto-publish new products, show prices (global). `settings.whatsapp_number` overrides env `WHATSAPP_NUMBER`.
- **S7 — Category mappings.** Admin can map Masefer meta_category/family/subfamily to SICOR categories and see unmapped ("Otros") families.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1 | Auth: scrypt password hash CLI, signed session cookie, login/logout, rate limit, proxy guard for /admin, `requireAdmin()` for server actions, admin layout shell + nav | gentle-ai-worker | done | feat(auth) commit |
| T2 | S2, S3, S4, S6, S7 | Admin data layer `src/server/admin/`: product queries/filters/pagination, override updates + bulk, image upload store, settings, mappings, sync wrappers; validation; PGlite tests | gentle-ai-worker | done (no RED observed — tests written after code) | feat(admin) commit |
| T3 | S2, S3, S4 | Admin UI products: list with filters/search/bulk, edit page, review queue | gentle-ai-worker | pending | |
| T4 | S5, S6, S7 | Admin UI updates + settings + mappings: pending notice confirm/cancel, manual check, failures, runs history, settings form, mappings page | gentle-ai-worker | pending | |

## Log

- **L1** (original request, verbatim in `odd/tasks/catalog-sync.md` L1): "...un dashboard administrativo para ocultar productos, cambiar, ocultar precios, mostrar precios, cambiar precios, cambiar imágenes, mostrar esto, mostrar..."
- **L2** (verbatim): "La idea es la siguiente te la paso en limpio por que es mas simple de lo que pensas es un pagina catalogo principalmente para mobile por que se va a brindar por whatapp siempre que obtenga mediente esa herramienta todos los productos de ese provedor y nosotros tener un dashboard privado para una solo usario que es el cliente puede modificar los precios, nombres, ocultar modifcar etc y mas adelante hacer mas cosas de dashboard administrativo, por que lo principal es el catalogo"
- **L4** (verbatim): "no una frecuencia semanalOh I think what you pensé is that there would have been a bottom of synchronization that you think che, no sé, subieron three product nuevos, quieres actualizar y el admin, si quieres actualizar, and if no, the synchronization. semanal 15 days, not more than this. But propongo del button, that is 15 days of synchronization and there's a button that would have manual with an aviso."
- **L5** (verbatim): "todo en el dashbaord del admin"
- **L6** (Phase 3 start): "si" (answering "¿Arranco con la Fase 3, el dashboard del admin?").
- **L7** (decision, parent): auth without third-party auth service — env credentials, scrypt (node:crypto), signed cookie (jose or HMAC), Next 16 `proxy.ts` guard plus server-side `requireAdmin()` in every action/page. Next 16 has breaking changes: read `node_modules/next/dist/docs/` before using routing/middleware/server-action APIs. Dev DB: `postgres://sicor:devpass@localhost:5433/sicor`, IMAGES_DIR `./data/images` (real data: 551 products, 28 visible).
- **L8** (evidence): T1 — scrypt hash `scrypt:N:r:p:salt:hash`, HMAC session cookie `sicor_admin` 7d, proxy.ts guard (307 → /admin/login verified on standalone build), in-memory rate limit 5/15min keyed on x-forwarded-for. T2 — hand-rolled validation, magic-byte images ≤5 MB under custom/, sync wrappers return {ok,run,error}. Suite 201/201 (one transient timeout in tests/jobs/sync.test.ts under parallel load).
