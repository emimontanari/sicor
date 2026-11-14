import { createHash, timingSafeEqual } from "node:crypto";

export type SyncAuthResult = { ok: true } | { ok: false; status: 401 | 503 };

const digest = (s: string) => createHash("sha256").update(s).digest();

/**
 * Authorizes the internal sync trigger. 503 = endpoint disabled (no secret configured),
 * 401 = missing/invalid bearer. Comparison is constant time (hashes have equal length).
 */
export function authorizeSyncRequest(authorization: string | null | undefined, secret: string | undefined): SyncAuthResult {
  if (!secret) return { ok: false, status: 503 };
  const match = /^Bearer (.+)$/.exec(authorization ?? "");
  const presented = match ? match[1] : "";
  const equal = timingSafeEqual(digest(presented), digest(secret));
  return match && equal ? { ok: true } : { ok: false, status: 401 };
}
