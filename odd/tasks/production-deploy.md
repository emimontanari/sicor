# Feature: production-deploy (SICOR live on Dokploy at sicor.shop)

Deploy the whole app (Next.js + Postgres + image/PDF volume) to the user's Dokploy, with the initial Masefer import, the 15-day scheduled check and the sicor.shop domain. Two small code fixes found while preparing the deploy are tracked here.

## Specs

- **S1 — First boot seeds default category mappings.** Production runs only `node migrate.cjs` at boot (no `catalog:bootstrap`, no tsx in the runtime image), so without seeded Masefer family→SICOR category mappings every product lands in «Otros». On the very first boot — when the categories table was empty and the 7 default categories get seeded — also insert the default category mappings (src/server/bootstrap/category-mappings.ts), skipping slugs that do not exist. Never on later boots (an admin's renamed/deleted categories and their removed mappings are never resurrected).
- **S2 — Public base URL in production.** docker-compose.yml passes `PUBLIC_BASE_URL` to the app so OG/WhatsApp link previews use the real domain instead of `http://localhost:3000`.
- **S3 — Deploy.** Dokploy project "SICOR" (Compose from https://github.com/emimontanari/sicor.git), env vars, persistent volumes, temporary Dokploy domain + `sicor.shop` with HTTPS, scheduled check every 15 days, initial import confirmed from the admin. No secrets in the repository.

## Tasks

| ID | Specs | Task | Route | Status | Commit |
|----|-------|------|-------|--------|--------|
| T1 | S1, S2 | Boot mapping seed + compose PUBLIC_BASE_URL; tests | gentle-ai-worker | implemented, awaiting review | |
| T2 | S3 | Dokploy setup, push, deploy, initial import, domain, schedule | parent | pending | |

## Log

- **L1** (verbatim): "Bueno listo vamos a ponerlo en produccion en dockploy"
- **L2** (verbatim): "http://93.188.164.215:3000/dashboard/home y wl token por donde te lo paso por aca? o me hacer un sxfirpt otra cosa hay que modificar url sicor.shop que tengo ese dominio comprado en hostinger que es donde esta alojado mi sockploy"
- **L3** (verbatim): "\git remote add origin https://github.com/emimontanari/sicor.git"
- **L4** (verbatim): "pero hace el deploy en dockploy"
- **L5** (decision, user): admin of production: one simple account (proposed `admin@sicor.com.ar`; password provided out of the repository). Native review kept on (user chose "Mantener la revisión previa"); deploy follows the chained slice reviews.
- **L6** (T1 evidence, worker): RED `pnpm vitest run tests/db/boot-seed.test.ts` 5/5 failed (no `seedDefaults`). GREEN: new `seedCategories` returns `{seeded}`; new `seedDefaults` (src/server/db/seed.ts) inserts default mappings only when categories were seeded in that call; migrate.ts uses it; compose + README + docs/deploy-dokploy.md carry `PUBLIC_BASE_URL`. `pnpm vitest run tests/db tests/bootstrap tests/catalog` 118/118; `pnpm test` 446 passed, 3 skipped; `pnpm lint` clean; `pnpm build:migrate` OK (412.1kb, no next imports). `pnpm typecheck --incremental false`: only error is in generated `.next/types/validator.ts(219)` (stale Next types for src/app/layout modal slot), none in edited files.
