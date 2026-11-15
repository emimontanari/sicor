import path from "node:path";
import { describe, expect, it } from "vitest";
import { imageContentType, imageUrl, resolveImagePath } from "../../src/server/catalog/paths";

const root = path.resolve("/srv/data/images");

describe("resolveImagePath (S7 confinement)", () => {
  it("resolves a normal nested path inside the root", () => {
    expect(resolveImagePath(root, ["ABC", "0-1a2b.jpg"])).toBe(path.join(root, "ABC", "0-1a2b.jpg"));
  });
  it.each([
    [[".."]],
    [["..", "etc", "passwd"]],
    [["a", "..", "..", "x.jpg"]],
    [["."]],
    [[""]],
    [["a", "", "b.jpg"]],
    [["/etc/passwd"]],
    [["a/../../b.jpg"]],
    [["a\\..\\b.jpg"]],
    [["%2e%2e", "x.jpg"]],
    [["%2e%2e%2fx.jpg"]],
    [["..%2fx.jpg"]],
    [["a\0.jpg"]],
    [["C:\\x.jpg"]],
    [[]],
  ])("rejects %j", (segments) => {
    expect(resolveImagePath(root, segments as string[])).toBeNull();
  });
  it("rejects non-image extensions", () => {
    expect(resolveImagePath(root, ["a", "secret.txt"])).toBeNull();
    expect(resolveImagePath(root, ["a", "noext"])).toBeNull();
    expect(resolveImagePath(root, ["a", "x.svg"])).toBeNull();
  });
  it("rejects a relative root", () => {
    expect(resolveImagePath("images", ["a.jpg"])).toBeNull();
  });
});

describe("imageContentType / imageUrl", () => {
  it("maps extensions case-insensitively", () => {
    expect(imageContentType("a.JPG")).toBe("image/jpeg");
    expect(imageContentType("a.png")).toBe("image/png");
    expect(imageContentType("a.webp")).toBe("image/webp");
    expect(imageContentType("a.html")).toBeNull();
  });
  it("builds app urls under /images", () => {
    expect(imageUrl("ABC/0-x.jpg")).toBe("/images/ABC/0-x.jpg");
    expect(imageUrl("/images/A B/x.jpg")).toBe("/images/A%20B/x.jpg");
  });
});
