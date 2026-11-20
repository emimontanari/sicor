# Feature: category-crud

Sistema de categorías simple en `/admin/categorias`: lista de categorías SICOR con Agregar, Editar (renombrar) y Eliminar. Reemplaza el mapeo de familias Masefer en la UI del admin.

## Specs

- **S1** — El admin `/admin/categorias` lista las categorías SICOR (nombre + cantidad de productos) con «Agregar categoría», «Editar» (renombrar) y «Eliminar»; nada más.
- **S2** — Eliminar pide confirmación y sus productos pasan a «Otros» en el catálogo (se limpia la categoría del override y se quitan las reglas automáticas de familias Masefer que apuntaban a ella).
- **S3** — Se elimina la UI de mapeo de familias Masefer del admin (los datos de mapeo y su comportamiento automático se mantienen, sin UI). La categoría por producto sigue editable desde la edición del producto y en «Asignar categoría» masivo.
- **S4** — Las categorías nuevas aparecen en los filtros del catálogo público (slug generado, ícono genérico de respaldo) y en los selects de categoría del admin.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1, S2, S3, S4 | Datos (`createCategory`/`renameCategory`/`deleteCategory`), seed que no resucita, UI simple, tests | gentle-ai-worker | done (sin commit; el padre decide git) | — |

Riesgo: ítem 1 — eliminar una categoría borra filas guardadas (`category_mappings` que la referencian).

## Log

- **L1** (human request, verbatim): "No estoy logrando entender el sistema de categorías. Me parece muy confuso. Tiene que ser un sistema de categorías simple. Las categorías que están disponibles se pueden eliminar, se pueden editar o se pueden agregar categorías nuevas. No sé por qué tanta sobreingeniería estás haciendo. Estás haciendo sobreingeniería en cosas de... en rotulación de categorías."
- **L2** (supersedes): reemplaza `odd/tasks/admin-categories.md` (ese diseño y la lista de mapeo «Sin asignar» primero).
- **L3** (T1 result, S1–S4): `createCategory`/`renameCategory`/`deleteCategory`/`listCategoriesWithCounts` en `src/server/admin/categories.ts` (borrado en una transacción; sin migración: `product_overrides.category_id` ya es `ON DELETE SET NULL` y `category_mappings` `CASCADE`, igual se borran/limpian explícitamente). `seedCategories` ahora solo siembra con la tabla vacía (no resucita renombradas/eliminadas). UI simple en `/admin/categorias` (lista + Agregar/Editar/Eliminar con Drawer y toast); UI de mapeo eliminada. Verificado en vivo a 390px: Agregar «Prueba» → Editar «Prueba 2» → aparece en «Asignar categoría» de Productos → Eliminar (0 productos); lista final = inicial (7 categorías). Capturas: `/tmp/cat-list.png`, `/tmp/cat-add.png`, `/tmp/cat-delete.png`.
- **L3b** (S2 follow-up): `bootstrapCatalog` (`src/server/bootstrap/index.ts`) ya no usa `!` sobre `idBySlug`: omite las reglas por defecto y los productos PDF cuya categoría fue eliminada (no crea mapeos ni overrides para ellos) y deja intactas las categorías/mapeos restantes; en una BD vacía el comportamiento es el mismo. Test: `tests/bootstrap/bootstrap.test.ts` («skips default mappings and PDF products whose category the admin deleted»).
