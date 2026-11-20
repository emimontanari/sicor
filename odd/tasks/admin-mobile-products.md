# Feature: admin-mobile-products

Mobile-first admin dashboard for products: hamburger navigation, filter side drawer, per-item "…" menu (edit, hide, delete). Deleting archives a product in our database so supplier sync never re-proposes it.
Documentation-only tracking unit (test-first exception: no behavior).

## Specs

- **S1 — Mobile-first admin.** L1 verbatim: "Bueno, ahora vamos a empezar a trabajar en el dashboard. Quiero que sea un dashboard cómodo de usar en teléfono celular, porque va a ser una persona que va a usar la aplicación 100% en un teléfono celular, entonces el diseño y la comodidad tiene que estar para que la aplicación sea utilizada con un teléfono celular. Entonces los filtros tienen que ver menú hamburguesa, los filtros tienen que estar también como en un menú y que aprietas y que se desplíen para el costado y ahí se pueden activar, en que haya dialogues, que los botones de cerrar estén visibles, que sea cómodo usar administrativamente desde el celular." Admin section navigation behind a hamburger menu; product filters in a side panel (drawer) that slides in from the side, where filters are activated; dialogs with clearly visible close buttons; comfortable one-handed phone use.
- **S2 — Per-item "…" menu.** L2 verbatim: "me equivoque yo funciono, ahora quiero mejorar la UI de los firltros y que haya una opcion para modificar una vez en nuetra base los itemes solo tenemos mostrar que tengo un meno ... que dentro podes editar, ocultar eliminar". Each product row in the admin list has a "…" menu with Editar, Ocultar (Mostrar when hidden) and Eliminar, replacing the current lone show/hide control.
- **S3 — Delete = archive, never re-imported.** L3 (user choice): "Eliminar y no volver a traerlo (Recomendado)" — "Sale del catálogo y de la lista del panel, y las próximas búsquedas de Masefer no lo vuelven a proponer. Queda en una sección «Eliminados» para restaurarlo si te equivocaste." Deleting asks for confirmation in a dialog; the product disappears from the public catalog and from the admin list; supplier sync (append-only, `odd/tasks/append-only-sync.md`) never proposes it again; an «Eliminados» view lists archived products with Restaurar.
- **S4 — Editing stays in our database only.** Edits keep using our stored overrides (name, description, price, show price, category, image, visibility); sync never overwrites them (existing behavior, `odd/tasks/catalog-sync.md` S2).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S3, S4 | Data: archive flag (soft delete) on our product data + migration; read model excludes archived from public catalog and default admin lists; «Eliminados» filter; archive/restore functions; sync never re-proposes archived codes; tests | gentle-ai-worker | pending | — |
| T2 | S1 | UI: admin hamburger navigation, filter side drawer with visible close, apply/clear, active-filter chips; mobile-first | gentle-ai-worker | pending | — |
| T3 | S2, S3 | UI: per-row "…" menu (Editar, Ocultar/Mostrar, Eliminar) with confirm dialog, «Eliminados» view with Restaurar | gentle-ai-worker | pending (after T1, T2) | — |

## Log

- **L1** (human request, verbatim): see S1.
- **L2** (human request, verbatim): see S2.
- **L3** (human choice, verbatim): see S3.
- **L4** (context): append-only sync (commits 3ddc542, 9b06309) inserts only codes absent from our database, so a soft-deleted row that stays in the database is naturally never re-proposed; T1 must still verify it. Risk item 1 (schema migration / stored data).
