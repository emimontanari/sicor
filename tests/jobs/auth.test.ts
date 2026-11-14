import { describe, expect, it } from "vitest";
import { authorizeSyncRequest } from "../../src/server/jobs/auth";

describe("authorizeSyncRequest (S3/S8)", () => {
  it("is disabled (503) when SYNC_SECRET is unset or empty", () => {
    expect(authorizeSyncRequest("Bearer x", undefined)).toEqual({ ok: false, status: 503 });
    expect(authorizeSyncRequest("Bearer x", "")).toEqual({ ok: false, status: 503 });
  });
  it("accepts the exact bearer secret", () => {
    expect(authorizeSyncRequest("Bearer s3cret", "s3cret")).toEqual({ ok: true });
  });
  it.each([null, "", "s3cret", "Bearer", "Bearer ", "Bearer wrong", "Bearer s3cret2", "bearer s3cret", "Basic s3cret"])(
    "rejects %j with 401",
    (h) => {
      expect(authorizeSyncRequest(h, "s3cret")).toEqual({ ok: false, status: 401 });
    },
  );
});
