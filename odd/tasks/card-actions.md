# Feature: card-actions (card button layout like the reference + quantity stepper on the card)

Redesign the catalog card actions following the user's reference screenshot, and let users change/remove quantities directly from the card without opening the cart or the product detail. Design first with gentle-design, then implement the chosen artboard.

## Specs

- **S1 — Button layout like the reference, without favorite.** L1: "me gustaria que los botones queden asi distribuidos sin el favorito y que en vez de descargar pdf diga la ficha tecnica". Reference (`design/card-actions/reference.png`): horizontal card (photo left; name, "Código: …", price right); below, a row of secondary outlined buttons ([♡] [PDF Descargar PDF] [Ver detalle]); below that a full-width primary "Agregar al carrito" button. For SICOR: no favorite button; the PDF button reads "Ficha técnica" (only when the product has one); keep "Ver detalle" (opens the product sheet); full-width primary add button ("Agregar a la cotización" or shorter); no price — "Consultar cotización" stays (quote-only). Keep SICOR tokens (design/system.md), not the reference's blue.
- **S2 — Quantity stepper on the card.** L1: "si quiero elimina producto del carrito tengo que entrar al carrito y eliminar estaria bueno que sea - 2 + y si esta en 0 lo elimina y no hace falta entre detalle". Once a product is in the quote cart, the card's add button becomes a stepper "− N +"; "−" at 1 removes the item from the cart (back to the add button); changes persist in the cart store and update the cart count; no need to open the cart or the detail. Products with talle/color variants: define clear behavior (e.g. add opens the sheet to choose; the card shows the total quantity across variants and a way to manage them) — design must show it.
- **S3 — gentle-design first.** L1: "hace de nuevo gentle desing para aplicar estas mejoras". Produce artboards under `design/card-actions/`, user picks, then implement in the real stack. The current overall catalog design stays (catalog-redesign L10: "Ahora como está el producto, está perfecto").

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1, S2, S3 | Design artboards for card actions + stepper (mobile-first, desktop shown) | gentle-ai-worker | pending | |
| T2 | S1, S2 | Implement chosen artboard | gentle-ai-worker | blocked: waiting for user's design choice | |

## Log

- **L1** (verbatim): "me gustaria que los botones queden asi distribuidos sin el favorito y que en vez de descargar pdf diga la ficha tecnica /Users/emimontanari/Desktop/Captura\ de\ pantalla\ 2026-11-15\ a\ la\(s\)\ 10.22.10 a.m..png y segundo si quiero elimina producto del carrito tengo que entrar al carrito y eliminar estaria bueno que sea - 2 + y si esta en 0 lo elimina y no hace falta entre detalle hace de nuevo gentle desing para aplicar estas mejoras". Also attached: screenshot of the current mobile cards (photo left, "AGREGADO (1)" charcoal button + "FICHA TÉCNICA" outlined button side by side).
- **L2**: reference copied to `design/card-actions/reference.png` (user-provided file from Desktop).
- **L3**: T1 design written to `design/card-actions/` (`01-paleta-referencia.html` red add + solid charcoal stepper; `02-stepper-tintado-papelera.html` tinted outlined stepper with trash at 1); pending user choice for T2.
