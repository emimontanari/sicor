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
| `pnpm sync:check` | Chequeo manual de cambios del proveedor; imprime el resumen JSON, sale con 1 si falla |
| `pnpm masefer:smoke` | Prueba en vivo del cliente Masefer |

## Variables de entorno

No hay `.env.example`; estas son todas:

| Variable | Obligatoria | Uso |
|---|---|---|
| `DATABASE_URL` | sí | Conexión Postgres |
| `IMAGES_DIR` | sí en producción (`/app/data/images`); local por defecto `./data/images` en `sync:check` | Directorio de imágenes copiadas |
| `SYNC_SECRET` | para el endpoint | Bearer del `POST /api/internal/sync/check`; sin él responde 503 |
| `POSTGRES_PASSWORD` | solo docker-compose | Password de Postgres |

## Sincronización

El chequeo (programado cada 15 días o manual) solo guarda un aviso pendiente; el admin lo confirma en el dashboard (Fase 3). Ver el deploy para configurar el schedule.
