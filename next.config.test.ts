import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("Content Security Policy", () => {
  it("allows the InPost Geowidget iframe application", async () => {
    const headerRules = await nextConfig.headers?.();
    const contentSecurityPolicy = headerRules
      ?.flatMap((rule) => rule.headers)
      .find((header) => header.key === "Content-Security-Policy")?.value;
    const frameSources = contentSecurityPolicy
      ?.split("; ")
      .find((directive) => directive.startsWith("frame-src "))
      ?.split(" ");

    expect(frameSources).toContain("https://geowidget-app.inpost.pl");
  });
});
