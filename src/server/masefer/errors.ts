export type MaseferSyncErrorCode = "connect" | "timeout" | "subscription" | "protocol" | "empty";

/** Any failure fetching the Masefer catalog. A catalog is never returned partially: failures throw this. */
export class MaseferSyncError extends Error {
  readonly code: MaseferSyncErrorCode;
  constructor(code: MaseferSyncErrorCode, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "MaseferSyncError";
    this.code = code;
  }
}
