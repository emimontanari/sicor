import { describe, expect, it } from "vitest";
import SearchRedirect from "../../src/app/buscar/page";
import CategoryRedirect from "../../src/app/categoria/[slug]/page";

async function redirectOf(run: () => Promise<unknown>): Promise<{ url: string; status: string }> {
  try {
    await run();
  } catch (e) {
    const digest = (e as { digest?: string }).digest ?? "";
    const [tag, , url, status] = digest.split(";");
    expect(tag).toBe("NEXT_REDIRECT");
    return { url, status };
  }
  throw new Error("expected a redirect");
}

describe("legacy URLs redirect permanently (308) to the single-page catalog", () => {
  it("/categoria/<slug> -> /?categoria=<slug>", async () => {
    expect(await redirectOf(() => CategoryRedirect({ params: Promise.resolve({ slug: "calzado-de-seguridad" }) }))).toEqual({
      url: "/?categoria=calzado-de-seguridad",
      status: "308",
    });
  });
  it("/buscar?q=guante verde -> /?q=guante+verde", async () => {
    expect(await redirectOf(() => SearchRedirect({ searchParams: Promise.resolve({ q: " guante verde " }) }))).toEqual({
      url: "/?q=guante+verde",
      status: "308",
    });
  });
  it("/buscar without q -> /", async () => {
    expect(await redirectOf(() => SearchRedirect({ searchParams: Promise.resolve({}) }))).toEqual({ url: "/", status: "308" });
  });
});
