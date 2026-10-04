import { describe, expect, it } from "vitest";
import { COLOR_HEX } from "../shared/constants.ts";
import { TOKENS } from "../src/theme/tokens.ts";

/** Machado, Oliveira & Fernandes 2009, 100 % CVD, linear sRGB. */
const CVD = {
  protan: [
    [0.152286, 1.052583, -0.204868],
    [0.114503, 0.786281, 0.099216],
    [-0.003882, -0.048116, 1.051998],
  ],
  deutan: [
    [0.367322, 0.860646, -0.227968],
    [0.280085, 0.672501, 0.047413],
    [-0.01182, 0.04294, 0.968881],
  ],
  tritan: [
    [1.255528, -0.076749, -0.178779],
    [-0.078411, 0.930809, 0.147602],
    [0.004733, 0.691367, 0.3039],
  ],
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    Number.parseInt(h.slice(0, 2), 16) / 255,
    Number.parseInt(h.slice(2, 4), 16) / 255,
    Number.parseInt(h.slice(4, 6), 16) / 255,
  ];
}

function srgbToLinear(c: number): number {
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(c: number): number {
  const x = Math.max(0, Math.min(1, c));
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function mul(m: readonly (readonly number[])[], rgb: [number, number, number]): [number, number, number] {
  return [
    m[0]![0]! * rgb[0] + m[0]![1]! * rgb[1] + m[0]![2]! * rgb[2],
    m[1]![0]! * rgb[0] + m[1]![1]! * rgb[1] + m[1]![2]! * rgb[2],
    m[2]![0]! * rgb[0] + m[2]![1]! * rgb[1] + m[2]![2]! * rgb[2],
  ];
}

function rgbToLab(lin: [number, number, number]): [number, number, number] {
  const x = 0.4124564 * lin[0] + 0.3575761 * lin[1] + 0.1804375 * lin[2];
  const y = 0.2126729 * lin[0] + 0.7151522 * lin[1] + 0.072175 * lin[2];
  const z = 0.0193339 * lin[0] + 0.119192 * lin[1] + 0.9503041 * lin[2];
  const f = (t: number) => (t > 0.008856 ? t ** (1 / 3) : 7.787 * t + 16 / 116);
  const fx = f(x / 0.95047);
  const fy = f(y / 1);
  const fz = f(z / 1.08883);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

function deltaE76(a: [number, number, number], b: [number, number, number]): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

function hexToLinear(hex: string): [number, number, number] {
  const [r, g, b] = hexToRgb(hex);
  return [srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)];
}

function simulate(hex: string, kind: keyof typeof CVD | "normal"): [number, number, number] {
  const lin = hexToLinear(hex);
  if (kind === "normal") return lin;
  const out = mul(CVD[kind], lin);
  return [
    srgbToLinear(linearToSrgb(out[0])),
    srgbToLinear(linearToSrgb(out[1])),
    srgbToLinear(linearToSrgb(out[2])),
  ];
}

function minPairDelta(kind: keyof typeof CVD | "normal"): number {
  const colors = Object.values(COLOR_HEX);
  let min = Infinity;
  for (let i = 0; i < colors.length; i++) {
    for (let j = i + 1; j < colors.length; j++) {
      const d = deltaE76(rgbToLab(simulate(colors[i]!, kind)), rgbToLab(simulate(colors[j]!, kind)));
      if (d < min) min = d;
    }
  }
  return min;
}

function relLum(hex: string): number {
  const [r, g, b] = hexToLinear(hex);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const l1 = relLum(a);
  const l2 = relLum(b);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

describe("paleta Okabe-Ito y contraste", () => {
  it("ΔE76 mínimo entre jugadores supera los umbrales CVD", () => {
    expect(minPairDelta("normal")).toBeGreaterThanOrEqual(35);
    expect(minPairDelta("protan")).toBeGreaterThanOrEqual(18);
    expect(minPairDelta("deutan")).toBeGreaterThanOrEqual(15);
    expect(minPairDelta("tritan")).toBeGreaterThanOrEqual(12);
  });

  it("tokens de ficha y pergamino cumplen WCAG", () => {
    expect(contrast(TOKENS.tokenInk, TOKENS.tokenCream)).toBeGreaterThanOrEqual(12);
    expect(contrast(TOKENS.tokenHot, TOKENS.tokenCream)).toBeGreaterThanOrEqual(5);
    expect(contrast(TOKENS.parchment, TOKENS.panel)).toBeGreaterThanOrEqual(7);
  });

  it("mantiene las claves de COLOR_HEX", () => {
    expect(Object.keys(COLOR_HEX).sort()).toEqual(["azul", "blanco", "marron", "naranja", "rojo", "verde"].sort());
    expect(COLOR_HEX.rojo).toBe("#E0601A");
    expect(COLOR_HEX.azul).toBe("#2E93D6");
    expect(COLOR_HEX.marron).toBe("#D58BBA");
  });
});
