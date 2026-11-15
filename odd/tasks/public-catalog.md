# Feature: public-catalog (Phase 2 — mobile-first catalog + WhatsApp quote cart)

Phase 2 of `docs/idea.md`, built on Phase 1 (`odd/tasks/catalog-sync.md`: Masefer sync, schema, `effectiveVisibility`). Public, mobile-first catalog shared by WhatsApp link; quote-only; cart sent via `wa.me`. The admin dashboard UI is Phase 3 (out of scope), so an initial curation bootstrap is provided here.

## Specs

- **S1 — Mobile-first catalog shared by WhatsApp.** L2: "es un pagina catalogo principalmente para mobile por que se va a brindar por whatapp". Fast, shareable links (category and product URLs with Open Graph tags for WhatsApp previews).
- **S2 — Quote-only.** L3: "\"Consultar cotización\"". Every product shows "Consultar cotización"; no prices by default (prices only if `settings.show_prices` and override `show_price` allow it — off by default).
- **S3 — Quote cart sent by WhatsApp.** L3: "se van a agregar a un carrtio y el carrtio se manda por whatapp con un mensaje con la api de whatapp simple como usa en todos lados". Cart in localStorage (no account): product, quantity, chosen variant (talle/color) when applicable, optional note. "Enviar por WhatsApp" opens `https://wa.me/<number>?text=<urlencoded message>` listing items and quantities. Number and message template come from `settings` (dashboard later), with env fallback `WHATSAPP_NUMBER`.
- **S4 — Only curated products are public.** L1: "en base yo mostrar los que quiero, los que no quiero". Public pages show only products where `effectiveVisibility` is true (discontinued hidden; override wins; new products hidden unless `auto_publish_new`). Effective name/image/category/description use client overrides first, then supplier data.
- **S5 — Categories.** The 7 SICOR categories from the PDF: Indumentaria laboral, Calzado de seguridad, Elementos de protección personal, Protección ocular y auditiva, Guantes de protección, Seguridad vial, Productos destacados. A product's category = override `category_id` ?? `category_mappings` (Masefer meta_category/family/subfamily) ?? none ("Otros productos").
- **S6 — Brand.** Look follows the PDF: SICOR logo, red (~#E1202F), charcoal (~#2B2A33), white/light gray, bold sans-serif uppercase headings, numbered category list. Footer "SICOR | SUMINISTROS INDUSTRIALES CÓRDOBA". Product notes like "Compre este producto por PACK de 10 y agilice la entrega" may be shown when present (override description).
- **S7 — Images served from own storage.** Product images come from `local_images` / `custom_image_path` under `IMAGES_DIR`, served by the app with path confinement; never hotlink Masefer/Dropbox (Phase 1 S6).
- **S8 — Initial curation bootstrap.** docs/idea.md: "suggest an initial import that publishes only the PDF's products". A one-time `pnpm catalog:bootstrap` runs check+apply, seeds default category mappings, and marks the PDF's products visible with their PDF category.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S2, S4, S5, S7 | Catalog read model `src/server/catalog/` (categories with counts, list/search/get product with effective fields, settings + env fallback) + image serving route with path confinement; PGlite tests | gentle-ai-worker | pending | |
| T2 | S5, S8 | Bootstrap: default category mappings from live Masefer taxonomy + PDF product list matched to Masefer codes + `pnpm catalog:bootstrap`; tests | gentle-ai-worker | pending | |
| T3 | S1, S2, S5, S6 | Public UI: layout/brand, home (categories, destacados, search), category page, product page (variant picker), search, OG tags | gentle-ai-worker | pending | |
| T4 | S3 | Quote cart (localStorage) + WhatsApp message builder + send button; tests | gentle-ai-worker | pending | |

## Log

- **L1** (Phase 2 start): "si, docker esta online" (answering "El siguiente paso es la Fase 2 ... ¿Arranco?").
- **L2** (from Phase 1 log, verbatim): "La idea es la siguiente te la paso en limpio por que es mas simple de lo que pensas es un pagina catalogo principalmente para mobile por que se va a brindar por whatapp siempre que obtenga mediente esa herramienta todos los productos de ese provedor y nosotros tener un dashboard privado para una solo usario que es el cliente puede modificar los precios, nombres, ocultar modifcar etc y mas adelante hacer mas cosas de dashboard administrativo, por que lo principal es el catalogo"
- **L3** (verbatim): "\"Consultar cotización\" y se van a agregar a un carrtio y el carrtio se manda por whatapp con un mensaje con la api de whatapp simple como usa en todos lados y estaria bueno que cuando haya una actualizacion de masefer, se haga automatico"
- **L4** (source PDF): `/Users/emimontanari/Downloads/SICOR_catalogo_interior_editable_Canva.pptx.pdf` (14 pages; cover with logo, numbered category index, product cards: name, note, "CONSULTAR COTIZACIÓN").
- **L5** (decision, parent): rendering is dynamic (DB not available at Docker build time). SICOR's real WhatsApp number is unknown → `WHATSAPP_NUMBER` env fallback until the dashboard sets it.
