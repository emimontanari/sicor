import { hashPassword } from "./password";

async function readPassword(): Promise<string> {
  const stdin = process.stdin;
  if (stdin.isTTY) {
    process.stderr.write("Contraseña (no se muestra): ");
    return new Promise((resolve) => {
      let buf = "";
      stdin.setRawMode(true);
      stdin.resume();
      stdin.setEncoding("utf8");
      const onData = (ch: string) => {
        for (const c of ch) {
          if (c === "\u0003") process.exit(130);
          if (c === "\r" || c === "\n" || c === "\u0004") {
            stdin.setRawMode(false);
            stdin.pause();
            stdin.off("data", onData);
            process.stderr.write("\n");
            return resolve(buf);
          }
          if (c === "\u007f") buf = buf.slice(0, -1);
          else buf += c;
        }
      };
      stdin.on("data", onData);
    });
  }
  let data = "";
  for await (const chunk of stdin) data += chunk;
  return data.replace(/\r?\n$/, "");
}

const password = await readPassword();
if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres.");
  process.exit(1);
}
console.log(await hashPassword(password));
