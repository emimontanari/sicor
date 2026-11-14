import { runCheck } from "./sync";

const result = await runCheck("manual");
console.log(JSON.stringify(result));
process.exit(result.ok ? 0 : 1);
