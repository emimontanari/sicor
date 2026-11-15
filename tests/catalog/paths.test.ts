import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  imageContentType,
  imageUrl,
  resolveImageFile,
  resolveImagePath,
} from "../../src/server/catalog/paths";

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

describe("resolveImageFile (S7 symlink confinement)", () => {
  let tmp: string;
  let rootDir: string;
  let outside: string;
  beforeAll(async () => {
    tmp = await mkdtemp(path.join(os.tmpdir(), "sicor-img-"));
    rootDir = path.join(tmp, "images");
    outside = path.join(tmp, "outside");
    await mkdir(path.join(rootDir, "A"), { recursive: true });
    await mkdir(outside);
    await writeFile(path.join(rootDir, "A", "ok.png"), "x");
    await writeFile(path.join(outside, "secret.png"), "secret");
    await symlink(outside, path.join(rootDir, "linkdir"));
    await symlink(path.join(outside, "secret.png"), path.join(rootDir, "A", "linkfile.png"));
    await symlink(path.join(rootDir, "A", "ok.png"), path.join(rootDir, "A", "internal.png"));
  });
  afterAll(async () => {
    await rm(tmp, { recursive: true, force: true });
  });

  it("resolves a normal file", async () => {
    const r = await resolveImageFile(rootDir, ["A", "ok.png"]);
    expect(r).toBe(path.join(await realpath(rootDir), "A", "ok.png"));
  });
  it("rejects a symlinked directory pointing outside", async () => {
    expect(await resolveImageFile(rootDir, ["linkdir", "secret.png"])).toBeNull();
  });
  it("rejects a symlinked file pointing outside", async () => {
    expect(await resolveImageFile(rootDir, ["A", "linkfile.png"])).toBeNull();
  });
  it("allows a symlink that stays inside the root (documented choice)", async () => {
    const r = await resolveImageFile(rootDir, ["A", "internal.png"]);
    expect(r).toBe(path.join(await realpath(rootDir), "A", "ok.png"));
  });
  it("returns null for missing files, directories, lexical violations and a missing root", async () => {
    expect(await resolveImageFile(rootDir, ["A", "nope.png"])).toBeNull();
    expect(await resolveImageFile(rootDir, ["A.png"])).toBeNull();
    expect(await resolveImageFile(rootDir, ["..", "outside", "secret.png"])).toBeNull();
    expect(await resolveImageFile(path.join(tmp, "missing"), ["a.png"])).toBeNull();
  });
  it("rejects a directory named like an image", async () => {
    await mkdir(path.join(rootDir, "dir.png"));
    expect(await resolveImageFile(rootDir, ["dir.png"])).toBeNull();
  });
});
