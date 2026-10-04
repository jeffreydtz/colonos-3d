import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

describe("jugabilidad extra", () => {
  it("atajos, turno, trueque de mano y log con badge", () => {
    const keys = readFileSync("src/ui/Hotkeys.tsx", "utf8");
    expect(keys).toContain('k === "r"');
    expect(keys).toContain('k === "p"');
    expect(keys).toContain("shortcuts-help");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="turn-banner"');
    // «Te toca» ya es la marca: el renglón «TU TURNO» abajo lo repetía.
    expect(hud).toContain('? "tu-turno" : undefined');
    expect(hud).not.toContain(">\n              Tu turno\n");
    expect(hud).toContain("bankTradeFrom");
    expect(hud).toContain("trade-inbox");
    const log = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    expect(log).toContain('data-testid="log-line"');
    expect(log).toContain("uppercase tracking-wide");
  });
});
