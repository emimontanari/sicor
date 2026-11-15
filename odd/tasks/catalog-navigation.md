# Feature: catalog-navigation (product opens as a sheet over the catalog; return exactly where you were)

Mobile-first navigation fix: opening a product must let the user go back to the catalog at the same place (scroll, filters, search) with an obvious close control, so they keep adding products.

## Specs

- **S1 — Clear way back, resume where you left.** L1: "Cuando yo entro a un producto y quiero volver de vuelta a donde ya donde estaba, no hay una opción clara para hacerlo. No hay un cerrar, una cruz, algo que al usuario le indique cómo volver para atrás y que retome la búsqueda en donde la dejó. Eso es importante. Tiene que retomar siempre la búsqueda donde la deja". Closing the product returns to the catalog with the same scroll position, filters (`?categoria=&marca=&q=&ficha=`) and the opened product card in view.
- **S2 — Product as a sheet over the catalog.** L2 decision: "Producto como hoja sobre el catálogo". Tapping a product in the catalog opens it over the catalog (full-screen on mobile, centered panel/drawer on desktop) without unmounting the catalog. Close via a visible X (top-right, sticky, does not cover the product card content), the phone's back button / browser back, Escape, and swipe-down on mobile (if feasible without hurting scroll inside the sheet). The URL changes to `/producto/<code>` (shareable); add-to-quote, variants, ficha técnica and documents work inside the sheet; the cart count updates.
- **S3 — Direct links still work.** L1: "pasa en catalogs y ahora pasa por WhatsApp y no van a abrir en el teléfono". Opening `/producto/<code>` directly (WhatsApp link, refresh) shows the full product page with an obvious "← Volver al catálogo" that goes to `/` (or the catalog with the product's category).
- **S4 — Mobile fluidity.** L1: "siempre pensando en mobile ... tienen que ser lo más fluido posible en el teléfono" and "que no invada la carta del producto, pero que sea fácil de ver y fácil de navegar de vuelta para seguir agregando productos". Fast open/close (no full reload), body scroll locked behind the sheet, focus management (focus into sheet on open, back to the card on close), reduced-motion respected.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1–S4 | Implement product sheet via Next 16 intercepting/parallel routes (or equivalent), close controls, scroll/filter preservation, direct-link back button; tests + mobile screenshots | gentle-ai-worker | done | feat(nav) commit |

## Log

- **L1** (verbatim): "bueno vamos con unas mejores ui y navegaacion que quiero que hagamos, primero si el boton agregar esta solo que sea de un tamano max por que si no se va agrandando a medida que se angranda la card y siento que estan muy grandes los botones / Y esta es la más importante que es el tema de la navegación. ¿Qué está pasando? Cuando yo entro a un producto y quiero volver de vuelta a donde ya donde estaba, no hay una opción clara para hacerlo. No hay un cerrar, una cruz, algo que al usuario le indique cómo volver para atrás y que retome la búsqueda en donde la dejó. Eso es importante. Tiene que retomar siempre la búsqueda donde la deja, porque si no es incómodo para el usuario, se pierda, no sabe dónde quedó. Entonces habría que ver a barajar opciones de que sería lo más cómodo para un usuario siempre pensando en mobile, porque pasa en catalogs y ahora pasa por WhatsApp y no van a abrir en el teléfono, entonces tienen que ser lo más fluido posible en el teléfono. Entonces algún botón de cerrar, una cruz, un volver atrás, que no invada la carta del producto, pero que sea fácil de ver y fácil de navegar de vuelta para seguir agregando productos."
- **L2** (user choice): "Producto como hoja sobre el catálogo (Recomendado)".
- **L3**: the "Agregar" button size cap (first part of L1) is a small separate fix handled outside this document.
- **L4** (evidence): intercepting route `@modal/(.)producto/[code]` + native `<dialog>` ProductSheet; close via X/back/Escape/swipe (mobile)/backdrop (desktop) → `router.back()` or `replace('/')`. Worker CDP run on a production build copy: scroll delta 0 at 390×844 and 1280×800 for every close method, URL query preserved, focus back on the card, cart count kept; direct `/producto/<code>` shows "← Volver al catálogo". Parent: 330/330 tests (321 + 9 new), typecheck OK after `next typegen`, lint OK; dev server restarted (worker had killed it with pkill). ProductSheet behaviors are browser-verified only.
