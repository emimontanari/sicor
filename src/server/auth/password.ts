import { randomBytes, scrypt, timingSafeEqual, type ScryptOptions } from "node:crypto";

// Encoded as: scrypt:N:r:p:saltB64:hashB64 (":" not "$", so env/compose files do not interpolate it)
const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;

function derive(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize("NFKC"), salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(password, salt, KEYLEN, { N, r: R, p: P, maxmem: 128 * N * R * 2 });
  return ["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join(":");
}

/** Constant-time verify. Returns false (never throws) for malformed encodings. */
export async function verifyPassword(password: string, encoded: string): Promise<boolean> {
  try {
    const parts = encoded.split(":");
    if (parts.length !== 6 || parts[0] !== "scrypt") return false;
    const [n, r, p] = [Number(parts[1]), Number(parts[2]), Number(parts[3])];
    if (![n, r, p].every((v) => Number.isInteger(v) && v > 0) || n > 1 << 20 || r > 32 || p > 16) return false;
    const salt = Buffer.from(parts[4], "base64");
    const expected = Buffer.from(parts[5], "base64");
    if (salt.length === 0 || expected.length === 0) return false;
    const actual = await derive(password, salt, expected.length, { N: n, r, p, maxmem: 256 * n * r });
    return actual.length === expected.length && timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
