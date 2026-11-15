import { buildSyncEngine } from "./sync";

const { engine, close } = buildSyncEngine();
try {
  const result = await engine.repairAssets();
  console.log(JSON.stringify(result));
} finally {
  await close();
}
