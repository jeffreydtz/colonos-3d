import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ClientView, TradeOffer } from "../shared/types.ts";
import { offersForYou, tradeTabFor } from "../src/play/actionTabs.ts";
import { dockLabel } from "../src/play/phaseCue.ts";

function view(p: { canBankTrade?: boolean; canTrade?: boolean; trades?: TradeOffer[] }): ClientView {
  return {
    youId: "p0",
    legal: { canBankTrade: p.canBankTrade ?? false, canTrade: p.canTrade ?? false },
    trades: p.trades ?? [],
  } as unknown as ClientView;
}

const offer = (id: string, fromId: string, toId: string): TradeOffer => ({
  id,
  fromId,
  toId,
  give: { lana: 1 },
  want: { trigo: 1 },
});

describe("panel de acciones en pestañas", () => {
  it("«Comerciar» abre el banco en tu turno y las ofertas cuando el banco está cerrado", () => {
    expect(tradeTabFor(view({ canBankTrade: true, canTrade: true }))).toBe("banco");
    expect(tradeTabFor(view({ trades: [offer("a", "p1", "todos")] }))).toBe("jugadores");
    expect(tradeTabFor(view({}))).toBe("banco");
  });

  it("el número de «Jugadores» cuenta sólo lo que podés responder", () => {
    const trades = [
      offer("a", "p1", "todos"),
      offer("b", "p1", "p0"),
      offer("c", "p0", "todos"),
      offer("d", "p2", "p1"),
    ];
    expect(offersForYou(view({ trades }))).toBe(2);
  });

  it("una cruz por panel, en la fila de pestañas; ni pill flotante ni «Cerrar» repetido", () => {
    const panel = readFileSync("src/ui/ActionPanel.tsx", "utf8");
    expect(panel).toContain('role="tablist"');
    expect(panel).toContain('role="tabpanel"');
    expect(panel).toContain("<CloseButton");
    expect(panel).not.toContain("Banco / trueque");
    expect(panel).not.toMatch(/>\s*Cerrar\s*</);
    expect(panel).toContain("<BankTrade");
    expect(panel).toContain("<PlayerTrade");

    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).not.toContain("{title}");
    expect(hud).toContain('closeTestId="sheet-close"');
    expect(hud).toContain('testId="dock-trade"');
    expect(hud).toContain('data-testid="trade-show"');
    // Las ofertas no se muestran dos veces cuando la pestaña «Jugadores» está abierta.
    expect(hud).toContain('offersShownSheet ? "max-lg:hidden"');

    const mesa = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    expect(mesa).toContain("<CloseButton");
    expect(mesa).toContain("{FILTERS.map(");
    expect(mesa).not.toContain("COMPACT_FILTERS");
    const keys = readFileSync("src/ui/Hotkeys.tsx", "utf8");
    expect(keys).toContain('actionTab: "construir"');
  });

  it("opciones en castellano y sin atajos de teclado en pantallas táctiles", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('sfxOn ? "activado" : "apagado"');
    expect(hud).toContain("pointer-coarse:hidden");
    expect(hud).not.toMatch(/Sonido: \{sfxOn \? "on"/);
  });

  it("en escritorio Opciones se abre a la izquierda, lejos del registro", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("lg:left-3");
    expect(hud).not.toContain("lg:right-3");
  });

  it("el botón del celu dice la fase cuando no hay dados ni pasar", () => {
    expect(dockLabel("colocacion_poblado", true, "Luz")).toBe("Poblado");
    expect(dockLabel("colocacion_camino", true, "Luz")).toBe("Camino");
    expect(dockLabel("descarte", true, "Luz")).toBe("Descartá");
    expect(dockLabel("ladron", true, "Luz")).toBe("Ladrón");
    expect(dockLabel("principal", true, "Luz")).toBe("Tu turno");
    expect(dockLabel("principal", false, "Mora")).toBe("Mora");
    expect(dockLabel("dados", false, "")).toBe("Esperá");
  });

  it("en escritorio la colocación tiene un botón de fase, no un «Tu turno» mudo", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain('data-testid="desk-phase"');
    expect(hud).toContain('data-testid="game-over"');
    expect(readFileSync("src/screens/Lobby.tsx", "utf8")).toContain('role="alert"');
  });
});

describe("carta nueva como sobre", () => {
  const reveal = readFileSync("src/three/CardReveal.tsx", "utf8");

  it("sobre, carta y destello en capas; un toque adelanta cada paso", () => {
    expect(reveal).toContain('type Stage = "sealed" | "open" | "front"');
    for (const layer of ["reveal-burst", "reveal-card", "reveal-flip", "reveal-pack", "reveal-holo"]) {
      expect(reveal).toContain(layer);
    }
    const css = readFileSync("src/index.css", "utf8");
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*\.reveal-flip/);
  });

  it("el nombre y el texto de la carta van una sola vez, en la carta", () => {
    expect(reveal.match(/\{spec\.title\}/g)).toHaveLength(1);
    expect(reveal.match(/\{spec\.subtitle\}/g)).toHaveLength(1);
    expect(reveal).not.toContain("spec?.subtitle");
    expect(reveal).not.toMatch(/Sonido (on|off)/);
  });
});
