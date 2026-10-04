import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RESOURCES } from "../shared/types.ts";
import { portSignCell } from "../src/three/pieces/portLayout.ts";

describe("ronda 6 íconos de recurso y desarrollo", () => {
  it("cinco siluetas distintas por recurso (daltonismo)", () => {
    const art = readFileSync("src/ui/icons/iconArt.ts", "utf8");
    expect(art).toContain('madera: "pine"');
    expect(art).toContain('ladrillo: "wall"');
    expect(art).toContain('lana: "sheep"');
    expect(art).toContain('trigo: "sheaf"');
    expect(art).toContain('mineral: "rock"');
    expect(art).not.toContain('mineral: "gem"');
    expect(art).not.toContain("M7 4.4h10l4.2 5.2");
    const icons = readFileSync("src/ui/icons/GameIcon.tsx", "utf8");
    expect(icons).toContain("data-shape={RESOURCE_SHAPE_KIND[resource]}");
  });

  it("HUD, tira, descarte, comercio y banco usan ResourceIcon, no abreviaturas", () => {
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).toContain("ResourceIcon");
    expect(hud).toContain("ResourcePick");
    expect(hud).toContain('data-testid="hand-strip"');
    expect(hud).not.toContain('data-testid="icon-labels-toggle"');
    expect(hud).toContain("<RateTag");
    expect(hud).toContain("<ProductionFly");
    expect(hud).not.toContain("RESOURCE_LABEL[r].slice(0, 3)");
    expect(hud).toContain('data-testid="discard-modal"');
    expect(hud).toContain('data-testid="steal-sheet"');

    const actions = readFileSync("src/ui/ActionPanel.tsx", "utf8");
    expect(actions).toContain("ResourcePick");
    expect(actions).toContain("BagIcons");
    expect(actions).toContain("settlementPortRate");
    expect(actions).toContain("DevIcon");
    expect(actions).toContain('data-testid="bank-rate"');
    expect(actions).not.toContain("doy {RESOURCE_LABEL");

    const mesa = readFileSync("src/ui/MesaPanel.tsx", "utf8");
    expect(mesa).toContain("ResourceQty");
    expect(mesa).toContain("ChatRichText");
    expect(mesa).toContain("CHAT_RESOURCE_TOKEN");
    expect(mesa).toContain("<PieceIcon");
  });

  it("puertos 2:1 pintan el ícono, no '2:1 Min/Lan/Tri'", () => {
    const ports = readFileSync("src/three/pieces/Ports.tsx", "utf8");
    expect(ports).toContain("paintResource");
    expect(ports).toContain("paintAnchor");
    expect(ports).toContain("portSignCell");
    expect(ports).toContain('"2:1"');
    expect(ports).not.toContain("2:1 Mad");
    expect(ports).not.toContain("2:1 Min");
    expect(ports).not.toContain("SIGN_LABELS");
    const pair = (type: string) => ({ id: "v", type, ratio: 2 as const, a: { x: 0, y: 0 }, b: { x: 0, y: 0 }, hex: null });
    expect(portSignCell(pair("general"))).toBe(0);
    expect(RESOURCES.map((r) => portSignCell(pair(r)))).toEqual([1, 2, 3, 4, 5]);
  });

  it("cartas de desarrollo y lámina S7 usan DevIcon original", () => {
    const reveal = readFileSync("src/three/CardReveal.tsx", "utf8");
    expect(reveal).toContain("DevIcon");
    expect(reveal).toContain("<DevIcon kind={kind}");
    const sheet = readFileSync("src/ui/icons/IconSheet.tsx", "utf8");
    expect(sheet).toContain('data-testid="icon-sheet"');
    expect(sheet).toContain("icon-row-res-24");
    expect(sheet).toContain("icon-row-dev-24");
    expect(sheet).toContain("grayscale");
    const game = readFileSync("src/screens/Game.tsx", "utf8");
    expect(game).toContain("IconSheet");
    const fixtures = readFileSync("server/devFixtures.ts", "utf8");
    expect(fixtures).toContain("S7-iconos");
  });
});
