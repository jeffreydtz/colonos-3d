import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { RESOURCE_LABEL } from "../shared/constants.ts";
import { ANCHOR_ART, DEV_ART, DEV_SHAPE_KIND, RESOURCE_ART, RESOURCE_SHAPE_KIND, type Layer } from "../src/ui/icons/iconArt.ts";

function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin((n >> 16) & 255) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
}

function colors(layers: Layer[]) {
  const strokes = layers.flatMap((l) => (l.stroke ? [luminance(l.stroke)] : []));
  const paints = layers.flatMap((l) => [l.fill, l.stroke].filter((c): c is string => !!c).map(luminance));
  return { strokes, paints };
}

describe("íconos propios: la forma identifica, el nombre es tooltip", () => {
  it("recursos, cartas y puerto tienen once siluetas distintas", () => {
    const kinds = [...Object.values(RESOURCE_SHAPE_KIND), ...Object.values(DEV_SHAPE_KIND), "anchor"];
    expect(new Set(kinds).size).toBe(11);
    expect(RESOURCE_SHAPE_KIND.mineral).toBe("rock");
  });

  it("el recurso gris se llama Piedra y es una pila de rocas, no una gema", () => {
    expect(RESOURCE_LABEL.mineral).toBe("Piedra");
    expect(Object.values(RESOURCE_LABEL).join(" ")).not.toMatch(/Mineral|\bMin\b/);
    const fills = RESOURCE_ART.mineral.filter((l) => l.fill && l.t === "path");
    expect(fills.length).toBeGreaterThanOrEqual(3);
  });

  it("cada ícono tiene borde oscuro y cuerpo claro: se lee sobre el HUD y sobre la ficha crema", () => {
    for (const layers of [...Object.values(RESOURCE_ART), ...Object.values(DEV_ART), ANCHOR_ART]) {
      const { strokes, paints } = colors(layers);
      expect(Math.min(...strokes)).toBeLessThan(0.06);
      expect(Math.max(...paints)).toBeGreaterThan(0.35);
    }
  });

  it("sin caja de color ni nombres fijos: el nombre va a data-tip", () => {
    const icons = readFileSync("src/ui/icons/GameIcon.tsx", "utf8");
    expect(icons).toContain("data-tip={decorative ? undefined : label}");
    expect(icons).not.toContain("showLabel");
    expect(icons).not.toContain('rx="5"');
    expect(icons).toContain("export function PortIcon");
    const hud = readFileSync("src/ui/Hud.tsx", "utf8");
    expect(hud).not.toContain("{RESOURCE_LABEL[r]}</span>");
    const actions = readFileSync("src/ui/ActionPanel.tsx", "utf8");
    expect(actions).not.toContain("showLabel");
    expect(actions).toContain("<PlayDev");
    const app = readFileSync("src/App.tsx", "utf8");
    expect(app).toContain("<IconTips />");
  });
});
