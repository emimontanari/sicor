# Feature: publish-on-sync (todos los artículos se publican al sincronizar; solo se muestran u ocultan)

Simplificación del esquema de visibilidad decidida por el usuario: el catálogo replica a Masefer y todo lo sincronizado se publica; ocultar es una decisión manual explícita. Reemplaza el flujo de revisión ("marcar como nuevo/revisado") y la cola de "Nuevos para revisar".

## Specs

- **S1 — Sincronizar publica.** L1: "Cuando se sincroniza y se hace una sincronización, todos los artículos que han publicado. Están todos publicados. No hace falta que el usuario haga más nada". Todo producto activo nuevo que se confirma en una sincronización queda visible al público sin pasos adicionales. Se implementa invirtiendo la visibilidad por defecto: un producto sin decisión explícita (sin override de visibilidad) es VISIBLE; se oculta solo con visible=false (o eliminado/archivado o, legado, discontinuado). El sync sigue sin escribir overrides.
- **S2 — Solo mostrar u ocultar.** L1: "Los artículos o se muestran o se ocultan. Nada más, no hace falta más nada." Desaparecen de la UI "Marcar como nuevo", "Marcar como revisados", "Volver a Nuevos", el filtro "Nuevos para revisar" y el enlace "Nuevos" de la navegación. El menú «…» por producto queda: Editar, Ocultar/Mostrar, Eliminar (y Restaurar/Editar en Eliminados). La hoja de acciones masivas queda: Mostrar, Ocultar, Asignar categoría. El campo `reviewed` deja de usarse (queda en la base sin exponerse).
- **S3 — Filtros simples.** L1: "Tiene marca como nuevo, marca como verificado, eso no hace falta ... yo que estoy desarrollando la aplicación, entro y no lo entiendo". Estado queda: Todos, Visibles, Ocultos, Eliminados. (Discontinuados deja de exponerse; con sync append-only ya no se genera.)
- **S4 — Ocultar es manual.** L1: "los que no quieran que estén publicados, los va a hacer mediante el filtro, uno por uno, como quiera ... o por categoría, o marcando varios". Ocultar/mostrar por producto, por selección de página o "todos los filtrados" (bulk a escala ya implementado) sigue disponible.
- **S5 — Ajustes.** Quitar `auto_publish_new` de Ajustes (obsoleto: siempre publica). Mantener número de WhatsApp, plantilla y mostrar precios.
- **S6 — Bug reportado.** L1: "cuando marcamos todo como nuevo falla" con stack de BulkForm. Esas acciones se eliminan por S2; antes de eliminar, diagnosticar la causa raíz desde el código/tests y registrarla en el Log (no dejar el error sin explicación).

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1–S6 | Comportamiento + UI: visibilidad por defecto visible, quitar flujo de revisión, simplificar Estado y Ajustes, diagnosticar bug; tests | gentle-ai-worker | pending | |
| T2 | S1–S5 | Verificación en vivo sobre la base de prueba y capturas 390px | gentle-ai-worker | pending | |

## Log

- **L1** (verbatim): "aca tenemos un error, cuando marcamos todo como nuevo falla, {\"name\":\"Stack\",\"stack\":\"...BulkForm...\"} No están dando el cambio de coso masivo, no está funcionando. Y siento que tiene muchas opciones que confunden también. Nuevo, ocultar, como muchas cosas que confunden mucho. Entonces yo quiero simplificar las funcionalidades. ¿Qué vamos a hacer? Vamos a cambiar el esquema. Vamos a hacer lo siguiente. Cuando se sincroniza y se hace una sincronización, todos los artículos que han publicado. Están todos publicados. No hace falta que el usuario haga más nada, porque es un catálogo en el cual replica. Entonces siempre va a querer que estén publicados. Y los que no quieran que estén publicados, los va a hacer mediante el filtro, uno por uno, como quiera. Porque si no él va a tener que estar pendiente todo el tiempo de primero actualizar, segundo marcarlo, tercero publicarlo, después verificar cuál no quiere, y son muchos pasos cuando se soluciona con Simplemente, cuando se sincroniza, todos los artículos sincronizados quedan publicados, quedan disponibles para la vista del público. Y después, el que se quiere ir eliminando, los va haciendo uno por uno, o por categoría, o marcando varios, etc. Entonces ahí ya eh simplificamos mucho esos filtros porque yo ahora, yo que estoy desarrollando la aplicación, entro y no lo entiendo, no entiendo qué opciones hace cada cosa.Tiene marca como nuevo, marca como verificado, eso no hace falta. Los artículos o se muestran o se ocultan. Nada más, no hace falta más nada. Y los cuando se sincronizan, se muestran."
- **L2 (supersedes):** odd/tasks/catalog-sync.md S5 (nuevos ocultos para revisar) y odd/tasks/admin-dashboard.md S4/S6 (cola de nuevos, auto_publish_new) quedan reemplazados por S1–S5 de este documento. El sync append-only (odd/tasks/append-only-sync.md) no cambia.
