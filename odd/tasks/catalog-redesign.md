# Feature: catalog-redesign (publish all products + single-page catalog with better filters)

User feedback after testing the local app: only 28 products visible (expected more), the filter UX is wrong, and the public page looks bad. Redesign the public catalog with gentle-design, then implement the chosen direction.

## Specs

- **S1 — Publish all active products.** L1: "hay 28 products and no son 28 products, son más". L2 decision: "Todos los activos (551)". The initial bootstrap publishes every active Masefer product (PDF products keep their PDF category and note); products the admin already hid stay hidden. `auto_publish_new` stays off (new products after this still go to review). Products without photos (132) must render with a good placeholder.
- **S2 — All products on one page with a nicer, responsive filter.** L1: "Tiene que salir todos los products in una sola página anda un filtro more lindo, responsive." L2 decision: applies to "El catálogo público". The public home lists all visible products in one view, filterable (category, brand, search; filters combinable, reflected in the URL so links are shareable by WhatsApp), mobile-first, fast with ~550 products.
- **S3 — Better-looking page via gentle-design.** L1: "Use gentle Design for a little bit linda la página. It's horrible." Produce design directions under `design/<slug>/`, user picks one, then implement it keeping SICOR brand (logo, red/charcoal), "Consultar cotización", the quote cart and WhatsApp send.

- **S4 — Cart and search access while scrolling.** L7: "el boton de cotizacion ahi me parece que cuando estas scroleando podes clickear, estaria mejor para que analisemos con gentle desing si la lupa esa no cumple ninguna funcion por que el buscador ya esta arriba esta medio al pedo ese boton, nose que opinas". The floating cart must not cover product actions while scrolling; the header search icon must not duplicate the visible search box.
- **S5 — Nicer filter buttons.** L8: "dale y podrias enbellecer un poco los botones del filtro dame unas opciones y elegimos". Offer several styling options for category/brand filter chips and the Filtros button; user picks.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1 | Bootstrap publishes all active products (respecting admin-hidden), tests; re-run on dev DB | gentle-ai-worker | done (dev DB: 551 visible) | feat(bootstrap) commit |
| T2 | S2, S3 | Design system sync + 3 design directions for the single-page public catalog (mobile + desktop) | gentle-ai-worker | done | docs(design) commit |
| T3 | S2, S3 | Implement chosen artboard `01-chips-y-hoja-de-filtros.html` in Next.js | gentle-ai-worker | done | feat(ui) single-page commit |
| T4 | S3, S4, S5 | Design variants: cart placement + search access (3) and filter chip styles (options) | gentle-ai-worker | in progress | |

## Log

- **L1** (verbatim): "Bueno, principalmente acá hay un problema porque hay 28 products and no son 28 products, son más. Así que hay que explorar this. And después el tema del filtro también está mal. Tiene que salir todos los products in una sola página anda un filtro more lindo, responsive. Use gentle Design for a little bit linda la página. It's horrible."
- **L2** (user answers): products → "Todos los activos (551)"; page → "El catálogo público".
- **L3** (evidence): dev DB: 551 active (Seguridad Industrial 300 / 195 with photo, Calzado 97/90, Indumentaria 78/69, Seguridad Vial 76/65); 28 visible, 523 never reviewed (no override row). `gentle_design list`: no designs, no design/system.md, design source `src/app/globals.css`.
- **L4** (design, T2): design system synced from `src/app/globals.css` (`design/system.md`, `design/system.html`); 3 directions in `design/catalog-single-page/`: `01-chips-y-hoja-de-filtros.html` (sticky chips + bottom-sheet filters), `02-barra-lateral-y-cajon.html` (sidebar + drawer, grouped collapsible filters), `03-mosaicos-de-categoria.html` (category tiles + grid/list). Waiting for the user to pick one (T3).
- **L5** (handoff): user chose `design/catalog-single-page/01-chips-y-hoja-de-filtros.html` ("Chips fijos + hoja de filtros") via gentle-design implement; `02-barra-lateral-y-cajon.html` and `03-mosaicos-de-categoria.html` remain alternatives. Visual spec = artboard; tokens = design/system.md.
- **L6** (evidence): T3 — client-side filtering over slim items (551), URL state `?categoria=&marca=&q=` with push/replace history, quick-add only for products without variants (others → "Elegir opciones"), `/categoria/*` and `/buscar` 308 → `/`. Suite 257/257, build OK. Parent reviewed 390/1280 screenshots. Home HTML ≈622 KB uncompressed in dev (all cards SSR).
- **L7** (verbatim): "el boton de cotizacion ahi me parece que cuando estas scroleando podes clickear, estaria mejor para que analisemos con gentle desing si la lupa esa no cumple ninguna funcion por que el buscador ya esta arriba esta medio al pedo ese boton, nose que opinas"
- **L8** (verbatim): "dale y podrias enbellecer un poco los botones del filtro dame unas opciones y elegimos" (approving parent proposal: variants 1) cart in header + compact search in sticky category bar, 2) variant 1 + bottom bar only when cart has items, 3) small icon FAB that hides on scroll down / shows on scroll up).
- **L9** (design, T4): added to `design/catalog-single-page/` (01–03 untouched): `04-carrito-en-encabezado.html` (cart in header + compact search in sticky category bar), `05-encabezado-y-barra-inferior.html` (04 + mobile bottom bar "N productos · Ver cotización" only with items), `06-boton-flotante-compacto.html` (small FAB, only with items, hides on scroll down), `07-estilos-de-filtros.html` (4 filter-chip styles A–D to choose from). Waiting for the user to pick a cart variant (S4) and a filter style (S5).
