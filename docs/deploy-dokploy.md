# Deploy en Dokploy (S8)

Toda la app corre en Dokploy como un único proyecto *Compose*: Next.js (`app`), Postgres (`postgres`), almacenamiento de imágenes (volumen) y el chequeo programado. No se usa Supabase ni Vercel.

## 1. Crear el proyecto

1. En Dokploy: **Project → Create Service → Compose**.
2. Provider: Git, apuntando a este repositorio, rama de producción; *Compose Path* `./docker-compose.yml`; tipo *Docker Compose*.
3. Asignar un dominio al servicio `app`, puerto `3000`.

## 2. Variables de entorno

Cargarlas en la pestaña **Environment** del compose:

| Variable | Descripción |
|---|---|
| `POSTGRES_PASSWORD` | Password del usuario `sicor` de Postgres (obligatoria). |
| `SYNC_SECRET` | Secreto largo y aleatorio (ej. `openssl rand -hex 32`). Autoriza el endpoint del chequeo. Si no está definido, el endpoint responde 503 (deshabilitado). |

`docker-compose.yml` ya define para `app`: `DATABASE_URL=postgres://sicor:${POSTGRES_PASSWORD}@postgres:5432/sicor` e `IMAGES_DIR=/app/data/images`. Si se usa un Postgres externo, sobrescribir `DATABASE_URL`.

## 3. Volúmenes (deben persistir)

- `postgres_data` → `/var/lib/postgresql/data`: base de datos.
- `app_data` → `/app/data`: imágenes copiadas del proveedor (`IMAGES_DIR`).

No eliminar estos volúmenes al redeployar. Hacer backup de ambos.

## 4. Primer deploy y migraciones

Al iniciar, el contenedor `app` ejecuta `node migrate.cjs` (aplica `drizzle/` y siembra las 7 categorías, idempotente) y recién después arranca el servidor. `app` espera a que `postgres` esté *healthy*. Si la migración falla el contenedor sale con error; revisar logs. Cada redeploy re-ejecuta las migraciones pendientes.

## 5. Chequeo programado cada 15 días (S3)

En el servicio compose: **Schedules → Create Schedule**:

- Service: `app`
- Cron: `0 6 */15 * *`
- Command (dentro del contenedor `app`, el secreto está en su entorno):

```sh
sh -c 'wget -q -O- --post-data="" --header="Authorization: Bearer $SYNC_SECRET" http://127.0.0.1:3000/api/internal/sync/check'
```

(alpine trae `wget`, no `curl`.) Alternativa desde un schedule en otro contenedor/host con `curl`:

```sh
curl -fsS -X POST -H "Authorization: Bearer $SYNC_SECRET" http://app:3000/api/internal/sync/check
# o con la URL pública: https://<tu-dominio>/api/internal/sync/check
```

**Por qué `*/15` en día del mes:** el cron corre los días 1, 16 y 31 de cada mes (el 31 solo en meses que lo tienen). Los intervalos son: dentro de un mes de 31 días, 1→16 = 15 días, 16→31 = 15 días y 31→1 = 1 día; en meses de 28–30 días, 1→16 = 15 días y 16→1 = 13 a 15 días. Nunca pasan más de 15 días entre chequeos, cumpliendo "no más que esto".

Respuestas del endpoint: `200 {runId,status,summary}` (chequeo ok), `500` con `error` (chequeo fallido; queda registrado como corrida fallida), `401` (secreto faltante/incorrecto), `503` (`SYNC_SECRET` sin configurar), `405` (método distinto de POST).

Si la base de datos está caída, el chequeo no puede registrarse (la respuesta trae `runId: null` y no queda fila en `sync_runs`); la señal es el HTTP 500 del schedule en Dokploy, así que conviene revisar los logs de las corridas del schedule.

## 6. Verificar

- Logs de `app`: `migrations applied, categories seeded`.
- Disparo manual (desde un contenedor con acceso a la app):
  `curl -fsS -X POST -H "Authorization: Bearer $SYNC_SECRET" https://<tu-dominio>/api/internal/sync/check` → JSON con `runId`.
- Sin header correcto → `401`.
- Tras la ejecución del schedule, Dokploy muestra el log de la corrida; en la tabla `sync_runs` aparece una fila con `trigger = 'scheduled'`.
- Local, contra una DB: `DATABASE_URL=... IMAGES_DIR=./data/images pnpm sync:check` (código de salida 1 si la corrida falla).

## 7. Qué hace (y qué no) el chequeo

El chequeo **solo calcula y guarda un aviso pendiente** (productos nuevos / modificados / quitados). No cambia el catálogo. El administrador confirma o descarta el aviso desde el dashboard (Fase 3); recién al confirmar se aplican los cambios y se copian las imágenes. Las ediciones del cliente (overrides) nunca se sobrescriben. Un chequeo fallido se registra y deja intacto el último catálogo bueno.
