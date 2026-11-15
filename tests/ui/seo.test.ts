import { afterEach, describe, expect, it } from "vitest";
import {
  absoluteUrl,
  baseUrl,
  buildPageMetadata,
  truncateDescription,
} from "../../src/lib/seo/metadata";

const saved = process.env.PUBLIC_BASE_URL;
afterEach(() => {
  if (saved === undefined) delete process.env.PUBLIC_BASE_URL;
  else process.env.PUBLIC_BASE_URL = saved;
});

describe("baseUrl / absoluteUrl", () => {
  it("falls back to localhost when PUBLIC_BASE_URL is unset", () => {
    delete process.env.PUBLIC_BASE_URL;
    expect(baseUrl()).toBe("http://localhost:3000");
  });
  it("strips trailing slashes from PUBLIC_BASE_URL", () => {
    process.env.PUBLIC_BASE_URL = "https://catalogo.sicor.com.ar//";
    expect(baseUrl()).toBe("https://catalogo.sicor.com.ar");
  });
  it("builds absolute URLs and keeps absolute inputs", () => {
    process.env.PUBLIC_BASE_URL = "https://x.test";
    expect(absoluteUrl("/producto/A1")).toBe("https://x.test/producto/A1");
    expect(absoluteUrl("images/a.jpg")).toBe("https://x.test/images/a.jpg");
    expect(absoluteUrl("https://cdn.test/a.jpg")).toBe("https://cdn.test/a.jpg");
  });
});

describe("truncateDescription", () => {
  it("collapses whitespace and leaves short text alone", () => {
    expect(truncateDescription("  hola \n  mundo ")).toBe("hola mundo");
  });
  it("truncates long text with an ellipsis within the limit", () => {
    const out = truncateDescription("palabra ".repeat(60), 100);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith("…")).toBe(true);
  });
});

describe("buildPageMetadata", () => {
  it("emits title, description, canonical, OG and Twitter with absolute image", () => {
    process.env.PUBLIC_BASE_URL = "https://x.test";
    const m = buildPageMetadata({
      title: "Camisa Ombú",
      description: "Camisa de trabajo",
      path: "/producto/CAM1",
      image: "/images/CAM1/a.jpg",
    });
    expect(m.title).toBe("Camisa Ombú");
    expect(m.description).toBe("Camisa de trabajo");
    expect(m.alternates?.canonical).toBe("https://x.test/producto/CAM1");
    expect(m.openGraph).toMatchObject({
      title: "Camisa Ombú",
      description: "Camisa de trabajo",
      url: "https://x.test/producto/CAM1",
      siteName: "SICOR",
      locale: "es_AR",
      type: "website",
      images: [{ url: "https://x.test/images/CAM1/a.jpg" }],
    });
    expect(m.twitter).toMatchObject({
      card: "summary_large_image",
      title: "Camisa Ombú",
      images: ["https://x.test/images/CAM1/a.jpg"],
    });
  });
  it("uses the brand image when none is given", () => {
    process.env.PUBLIC_BASE_URL = "https://x.test";
    const m = buildPageMetadata({ title: "t", description: "d", path: "/" });
    expect(m.openGraph).toMatchObject({
      images: [{ url: "https://x.test/brand/sicor-logo.png" }],
    });
  });
});
