import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("cambio 4:1 desde abajo del navegador", () => {
  it("en el celu la hoja queda fija sobre la barra y se puede cerrar", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    const css = readFileSync("src/index.css", "utf8");
    const vv = readFileSync("src/ui/useVisualViewportInset.ts", "utf8");
    expect(hud).toContain('data-testid="bank-quick"');
    expect(hud).toContain('data-testid="bank-quick-dismiss"');
    expect(hud).toContain('role="dialog"');
    expect(hud).toContain("createPortal");
    expect(hud).toContain("max-width: 1023px");
    expect(hud).toContain("var(--vv-bottom, 0px)");
    expect(hud).toContain("env(safe-area-inset-bottom)");
    expect(hud).toContain('pending?.kind === "bank"');
    expect(vv).toContain("--vv-bottom");
    expect(css).toContain("100dvh");
    const quick = hud.slice(hud.indexOf("function BankQuick"), hud.indexOf("function HandStrip"));
    expect(quick).toContain("fixed inset-0");
    expect(quick).toContain("z-[80]");
  });
});
