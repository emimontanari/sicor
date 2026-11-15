// One-off taxonomy inspector: pnpm tsx src/server/bootstrap/inspect.ts [out.json]
import { writeFileSync } from "node:fs";
import { MaseferClient } from "../masefer";

const cat = await new MaseferClient().fetchCatalog();
const counts = new Map<string, number>();
for (const p of cat.products) {
  const k = [p.metaCategory, p.family, p.subfamily].join(" | ");
  counts.set(k, (counts.get(k) ?? 0) + 1);
}
const out = process.argv[2];
if (out) {
  writeFileSync(out, JSON.stringify(cat.products.map((p) => ({ code: p.code, name: p.name, metaCategory: p.metaCategory, family: p.family, subfamily: p.subfamily }))));
}
for (const [k, n] of [...counts].sort()) console.log(n, k);
console.log("products", cat.products.length);
