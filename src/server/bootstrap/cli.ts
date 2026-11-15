import { createPgDb } from "../db";
import { MaseferClient } from "../masefer";
import { FsImageStore } from "../sync";
import { bootstrapCatalog } from "./index";

const { db, close } = createPgDb(process.env.DATABASE_URL);
try {
  const result = await bootstrapCatalog({
    db,
    source: new MaseferClient(),
    imageStore: new FsImageStore(process.env.IMAGES_DIR ?? "./data/images"),
  });
  console.log(JSON.stringify(result));
} catch (e) {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
} finally {
  await close();
}
