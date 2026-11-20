# SICOR

Catálogo de cotización (sin precios públicos) de elementos de seguridad/indumentaria, sincronizado desde el catálogo público del proveedor Masefer. Un único deploy en Dokploy. Diseño y fases: [docs/idea.md](docs/idea.md). Deploy: [docs/deploy-dokploy.md](docs/deploy-dokploy.md).

## Stack

Next.js (App Router) · TypeScript · Drizzle ORM · Postgres (producción) / PGlite (tests) · Vitest · pnpm · Docker/Dokploy.

## Desarrollo local

```sh
pnpm install
export DATABASE_URL=postgres://sicor:sicor@localhost:5432/sicor
export IMAGES_DIR=./data/images
pnpm db:migrate:run   # aplica ./drizzle y siembra categorías
pnpm dev
```

Los tests corren sobre PGlite en memoria: no requieren Postgres ni Docker (`pnpm test`).

## Scripts

| Script | Qué hace |
|---|---|
| `pnpm dev` / `build` / `start` | Next.js |
| `pnpm test` | Vitest (PGlite) |
| `pnpm typecheck` / `pnpm lint` | TypeScript / ESLint |
| `pnpm db:generate` | Genera migraciones desde `schema.ts` |
| `pnpm db:migrate:run` | Aplica migraciones + seed de categorías (usa `DATABASE_URL`) |
| `pnpm build:migrate` | Empaqueta el migrador a `out/migrate.cjs` (lo usa el Dockerfile) |
| `pnpm sync:check` | Busca códigos nuevos sin cambiar el catálogo; imprime el resumen JSON, sale con 1 si falla |
| `pnpm catalog:bootstrap` | Importa solo si el catálogo está vacío. Publica los productos activos, conserva la curación existente y no consulta al proveedor en las reejecuciones. Imprime `{appliedRunId, published, alreadyHidden, unmatched}` |
| `pnpm catalog:repair-assets` | Reparación explícita de copias locales de imágenes y fichas PDF; no se ejecuta durante la búsqueda ni la confirmación |
| `pnpm admin:hash-password` | Genera el hash de `ADMIN_PASSWORD_HASH` (contraseña por stdin) |
| `pnpm masefer:smoke` | Prueba en vivo del cliente Masefer |

## Variables de entorno

No hay `.env.example`; estas son todas:

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | sí | Conexión Postgres |
| `IMAGES_DIR` | sí en producción (`/app/data/images`); local por defecto `./data/images` en `sync:check` | Directorio de imágenes copiadas |
| `SYNC_SECRET` | para el endpoint | Bearer del `POST /api/internal/sync/check`; sin él responde 503 |
| `POSTGRES_PASSWORD` | solo docker-compose | Password de Postgres |
| `ADMIN_EMAIL` | para el dashboard | Email del único usuario admin (no distingue mayúsculas). Sin esto el admin queda deshabilitado; el catálogo público sigue funcionando. |
| `ADMIN_PASSWORD_HASH` | para el dashboard | Hash scrypt de la contraseña. Generarlo con `pnpm admin:hash-password` (lee la contraseña por stdin, nunca por argumento). |
| `SESSION_SECRET` | para el dashboard | Secreto aleatorio de al menos 32 caracteres (ej. `openssl rand -hex 32`) que firma la cookie de sesión (7 días). Si falta o es más corto, el admin queda deshabilitado. |
| `PUBLIC_BASE_URL` | recomendada en producción | URL pública del sitio, sin barra final (ej. `https://sicor.shop`). Se usa para las vistas previas de links (Open Graph / WhatsApp); vacía cae a `http://localhost:3000`. |
| `WHATSAPP_NUMBER` | no | WhatsApp de SICOR, solo dígitos con código de país (54 + 9 para móvil). Ej. `5493516682089`. Fallback hasta que exista el ajuste del dashboard (Fase 3 lo guarda en `settings.whatsapp_number`, que tiene prioridad). Vacío deshabilita el botón. |

## Seguridad del admin

- Salir borra la cookie del navegador, pero el token firmado sigue siendo válido hasta que vence (7 días); no hay revocación por sesión.
- Para invalidar todas las sesiones al instante, rotar `SESSION_SECRET`.
- El login tiene límite de intentos por IP+email (5 / 15 min) y por cuenta (10 / 15 min); el contador vive en memoria y se reinicia con el proceso.

## Sincronización

Después de la importación inicial, el catálogo se lee desde la base local, incluso si Masefer no responde. La búsqueda manual o programada solo propone códigos nuevos. El admin confirma en **Actualizaciones**: se agregan únicamente los códigos que aún no existen, sin modificar ni dar de baja productos existentes. Una búsqueda sin altas no borra las propuestas anteriores. Ver el deploy para configurar el schedule.
