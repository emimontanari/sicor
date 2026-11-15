/** True when the Origin header is present and its host equals the request host (x-forwarded-host wins over Host). */
export function isSameOrigin(origin: string | null, host: string | null, forwardedHost?: string | null): boolean {
  if (!origin) return false;
  const expected = (forwardedHost?.split(",")[0] || host || "").trim().toLowerCase();
  if (!expected) return false;
  try {
    return new URL(origin).host.toLowerCase() === expected;
  } catch {
    return false;
  }
}
