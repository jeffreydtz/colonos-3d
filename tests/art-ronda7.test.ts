import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("ronda 7 HUD y accesibilidad móvil", () => {
  it("aria-live, skip link, hit 44 px, reduced motion", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('role="complementary"');
    expect(hud).toContain("aria-live");
    expect(hud).toContain("Saltar a acciones");
    expect(hud).toContain('id="mobile-dock"');
    expect(hud).toContain("min-h-11");
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toContain("prefers-reduced-motion");
    expect(css).toContain("button:focus-visible");
    const sfx = readFileSync("src/audio/sfx.ts", "utf8");
    expect(sfx).toContain("prefers-reduced-motion");
  });
});
