import { describe, expect, it } from "vitest";
import * as THREE from "three";
import { buildBoard } from "../shared/board.ts";
import { hexCorner, hexToPixel, landAxials } from "../shared/hex.ts";
import { mulberry32 } from "../shared/rng.ts";
import type { ClientView, Terrain } from "../shared/types.ts";
import { fitBoard, measureHudInsets } from "../src/three/cam/fit.ts";
import { lensFor } from "../src/three/cam/poses.ts";
import {
  FRAME_W,
  PIECE_SCALE,
  PIECE_Y,
  ROAD_LEN,
  ROBBER_FOOT_R,
  S,
  SEA_MARGIN,
  TILE_BOTTOM,
  TILE_R_TOP,
  TILE_TOP,
  TOKEN_R,
  digitScale,
  makeHexPlate,
  robberSpot,
} from "../src/three/geo.ts";
import { hexHeight } from "../src/three/HexDecor.tsx";
import {
  BRICK,
  CRAG_H,
  CRAG_R,
  SHEEP_REACH,
  TREE_BASE_R,
  brickPose,
  forestPos,
  peakPose,
  sheepPos,
} from "../src/three/decorLayout.ts";
import { TILE_TINT, prismGeo, tileSpin, tileTint } from "../src/three/tiles.ts";
import { boardLayout, framing } from "../src/three/layout.ts";
import { portAnchor, portPairs } from "../src/three/pieces/portLayout.ts";
import { seaLook } from "../src/three/env/seaPalette.ts";
import { liteWood } from "../src/three/env/liteWood.ts";
import { THEMES } from "../src/theme/tokens.ts";

const KINDS = ["standard", "expansion"] as const;

function rowsOf(kind: (typeof KINDS)[number]) {
  const rows = new Map<number, number[]>();
  for (const a of landAxials(kind)) {
    rows.set(a.r, [...(rows.get(a.r) ?? []), hexToPixel(a.q, a.r, 1).x]);
  }
  return [...rows.entries()].sort((a, b) => a[0] - b[0]);
}

function apothemOf(poly: THREE.Vector2[], center: THREE.Vector2, p: { x: number; y: number }): number {
  let worst = -Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % poly.length]!;
    const n = new THREE.Vector2(b.y - a.y, -(b.x - a.x)).normalize();
    if (n.dot(new THREE.Vector2(a.x - center.x, a.y - center.y)) < 0) n.multiplyScalar(-1);
    worst = Math.max(worst, n.dot(new THREE.Vector2(p.x - a.x, p.y - a.y)));
  }
  return -worst;
}

describe("isla simétrica como el Catán físico", () => {
  it("clásica 3-4-5-4-3 = todos los hex a distancia ≤ 2, cada fila centrada en x = 0", () => {
    const ax = landAxials("standard");
    expect(ax).toHaveLength(19);
    for (const a of ax) expect(Math.max(Math.abs(a.q), Math.abs(a.r), Math.abs(a.q + a.r))).toBeLessThanOrEqual(2);
    for (const [, xs] of rowsOf("standard")) {
      expect(Math.abs(xs.reduce((s, x) => s + x, 0) / xs.length)).toBeLessThan(1e-9);
    }
  });

  it("grande 3-4-5-6-5-4-3: todas las filas comparten centro (ninguna fila corrida)", () => {
    const rows = rowsOf("expansion");
    expect(rows.map(([, xs]) => xs.length)).toEqual([3, 4, 5, 6, 5, 4, 3]);
    const centers = rows.map(([, xs]) => xs.reduce((s, x) => s + x, 0) / xs.length);
    for (const c of centers) expect(c).toBeCloseTo(centers[0]!, 9);
  });
});

describe("mar, marco y puertos", () => {
  for (const kind of KINDS) {
    it(`${kind}: el agua envuelve la costa con margen parejo y el marco va por fuera`, () => {
      const L = boardLayout(landAxials(kind));
      expect(L.sea).toHaveLength(6);
      for (const p of L.coast) {
        expect(apothemOf(L.sea, L.center, p)).toBeGreaterThanOrEqual(SEA_MARGIN - 1e-6);
      }
      for (const p of L.sea) {
        expect(apothemOf(L.frameOuter, L.center, p)).toBeCloseTo(FRAME_W, 6);
      }
    });

    it(`${kind}: cada puerto queda en el agua, afuera de su loseta y adentro del marco`, () => {
      const g = buildBoard(mulberry32(7), kind);
      const vertices = Object.values(g.vertices) as ClientView["vertices"];
      const pairs = portPairs(vertices);
      expect(pairs.length).toBe(kind === "standard" ? 9 : 11);
      const L = boardLayout(g.hexes);
      for (const pair of pairs) {
        expect(pair.hex).not.toBeNull();
        const { token } = portAnchor(pair);
        const hex = new THREE.Vector2(pair.hex!.x * S, pair.hex!.y * S);
        expect(token.distanceTo(hex)).toBeGreaterThan(S * 1.2);
        expect(apothemOf(L.sea, L.center, { x: token.x, y: token.y })).toBeGreaterThan(0.2);
      }
    });
  }
});

describe("encuadre según pantalla y HUD", () => {
  const cases = [
    { aspect: 1440 / 900, safe: { top: 0.14, bottom: 0.1, left: 0.01, right: 0.01 } },
    { aspect: 1120 / 868, safe: { top: 0.16, bottom: 0.11, left: 0.01, right: 0.01 } },
    // Escritorio con el panel de acciones abierto: el tablero se corre a la izquierda, no queda tapado.
    { aspect: 1120 / 868, safe: { top: 0.16, bottom: 0.11, left: 0.01, right: 0.28 } },
    { aspect: 390 / 660, safe: { top: 0.09, bottom: 0.02, left: 0.02, right: 0.02 } },
    { aspect: 390 / 844, safe: { top: 0.02, bottom: 0.02, left: 0.02, right: 0.02 } },
  ];
  for (const kind of KINDS) {
    for (const c of cases) {
      it(`${kind} @ ${c.aspect.toFixed(2)}: todo el tablero entra en la zona libre`, () => {
        const L = boardLayout(landAxials(kind));
        const f = framing(L, c.aspect);
        const lens = lensFor(c.aspect);
        const center = new THREE.Vector3(L.center.x, TILE_TOP, L.center.y);
        const fit = fitBoard(f.points, center, { ...lens, aspect: c.aspect, safe: c.safe });
        expect(fit.distance).toBeGreaterThan(8);
        expect(fit.distance).toBeLessThan(45);
        const cam = new THREE.PerspectiveCamera(lens.fovY, c.aspect, 0.1, 1000);
        cam.position.copy(fit.position);
        cam.lookAt(fit.target);
        cam.updateMatrixWorld();
        for (const p of f.points) {
          const v = p.clone().project(cam);
          expect(v.x).toBeGreaterThanOrEqual(-1 + 2 * c.safe.left - 1e-3);
          expect(v.x).toBeLessThanOrEqual(1 - 2 * c.safe.right + 1e-3);
          expect(v.y).toBeGreaterThanOrEqual(-1 + 2 * c.safe.bottom - 1e-3);
          expect(v.y).toBeLessThanOrEqual(1 - 2 * c.safe.top + 1e-3);
        }
        // La costa tiene que ocupar buena parte del ancho libre: no un tablero chiquito en el medio.
        let x0 = Infinity;
        let x1 = -Infinity;
        for (const p of L.coast) {
          const v = new THREE.Vector3(p.x, TILE_TOP, p.y).project(cam);
          x0 = Math.min(x0, v.x);
          x1 = Math.max(x1, v.x);
        }
        // Con el panel de acciones abierto queda ~70 % del ancho libre: se achica un poco, no a la mitad.
        const minHalf = c.safe.right > 0.1 ? 0.38 : c.aspect < 1 ? 0.78 : 0.42;
        expect((x1 - x0) / 2).toBeGreaterThan(minHalf);
      });
    }
  }
});

describe("márgenes del HUD medidos en el DOM", () => {
  type Box = { left: number; top: number; right: number; bottom: number; width: number; height: number };
  const box = (l: number, t: number, r: number, b: number): Box => ({ left: l, top: t, right: r, bottom: b, width: r - l, height: b - t });
  const canvas = { getBoundingClientRect: () => box(0, 0, 1120, 868) } as unknown as HTMLElement;
  const el = (edge: string, b: Box) => ({ dataset: { hudEdge: edge }, getBoundingClientRect: () => b });
  function measure(els: Array<ReturnType<typeof el>>) {
    const g = globalThis as { document?: unknown };
    const prev = g.document;
    g.document = { querySelectorAll: () => els };
    try {
      return measureHudInsets(canvas, 10);
    } finally {
      g.document = prev;
    }
  }

  it("el panel de acciones (alto y angosto, a la derecha) cuenta como margen derecho", () => {
    const s = measure([
      el("top", box(0, 0, 1120, 120)),
      el("bottom", box(0, 790, 800, 868)),
      el("right", box(820, 260, 1110, 860)),
    ]);
    expect(s.right).toBeCloseTo((1120 - 820 + 10) / 1120, 6);
    expect(s.left).toBeCloseTo(10 / 1120, 6);
    expect(s.top).toBeCloseTo(130 / 868, 6);
    expect(s.bottom).toBeCloseTo(88 / 868, 6);
  });

  it("un panel derecho bajito no corre el tablero", () => {
    const s = measure([el("right", box(820, 760, 1110, 860))]);
    expect(s.right).toBeCloseTo(10 / 1120, 6);
  });
});

describe("velas de la noche", () => {
  const views = [
    { aspect: 1440 / 900, safe: { top: 0.14, bottom: 0.1, left: 0.01, right: 0.01 } },
    { aspect: 390 / 660, safe: { top: 0.09, bottom: 0.02, left: 0.02, right: 0.02 } },
  ];
  for (const kind of KINDS) {
    for (const c of views) {
      it(`${kind} @ ${c.aspect.toFixed(2)}: sobre la mesa, fuera del marco y adentro de cuadro`, () => {
        const L = boardLayout(landAxials(kind));
        const f = framing(L, c.aspect);
        expect(f.candles).toHaveLength(2);
        const lens = lensFor(c.aspect);
        const fit = fitBoard(f.points, new THREE.Vector3(L.center.x, TILE_TOP, L.center.y), {
          ...lens,
          aspect: c.aspect,
          safe: c.safe,
        });
        const cam = new THREE.PerspectiveCamera(lens.fovY, c.aspect, 0.1, 1000);
        cam.position.copy(fit.position);
        cam.lookAt(fit.target);
        cam.updateMatrixWorld();
        for (const [x, z] of f.candles) {
          expect(apothemOf(L.frameOuter, L.center, { x, y: z })).toBeLessThan(-0.3);
          expect(Math.hypot(x - f.tray[0], z - f.tray[2])).toBeGreaterThan(1.4);
          for (const y of [-0.1, 0.35]) {
            const v = new THREE.Vector3(x, y, z).project(cam);
            expect(Math.abs(v.x)).toBeLessThan(0.98);
            expect(Math.abs(v.y)).toBeLessThan(0.98);
          }
        }
      });
    }
  }
});

describe("mar del modo liviano", () => {
  const lum = (hex: string) => {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
    const [r, g, b] = [1, 3, 5].map((i) => lin(parseInt(hex.slice(i, i + 2), 16) / 255));
    return { r: r!, g: g!, b: b!, y: 0.2126 * r! + 0.7152 * g! + 0.0722 * b! };
  };
  const onScreen = (theme: (typeof THEMES)[number]) => {
    const { palette, tint } = seaLook(true, theme);
    const d = lum(palette.deep);
    const t = lum(tint ?? "#ffffff");
    return { r: d.r * t.r, g: d.g * t.g, b: d.b * t.b, y: d.y * t.y };
  };

  it("sin luz y con tinte: azul que se lee en todos los temas, nunca casi negro", () => {
    for (const theme of THEMES) {
      const c = onScreen(theme);
      expect(c.b).toBeGreaterThan(c.r);
      expect(c.y).toBeGreaterThan(theme === "noche" ? 0.012 : 0.07);
    }
    expect(onScreen("noche").y).toBeLessThan(onScreen("atardecer").y);
    expect(onScreen("atardecer").y).toBeLessThan(onScreen("dia").y);
  });

  it("la costa aclara el agua sin volverse un halo", () => {
    for (const lite of [false, true]) {
      for (const theme of THEMES) {
        const { palette } = seaLook(lite, theme);
        const ratio = lum(palette.shallow).y / lum(palette.deep).y;
        expect(ratio).toBeGreaterThan(1.1);
        expect(ratio).toBeLessThan(2.6);
      }
    }
  });
});

describe("fichas y losetas como las impresas", () => {
  it("el número crece con la probabilidad: 6 y 8 los más grandes, 2 y 12 los más chicos", () => {
    const singles = [2, 3, 4, 5, 6];
    for (let i = 1; i < singles.length; i++) {
      expect(digitScale(singles[i]!)).toBeGreaterThan(digitScale(singles[i - 1]!));
    }
    expect(digitScale(8)).toBe(digitScale(6));
    const all = [2, 3, 4, 5, 6, 8, 9, 10, 11, 12].map(digitScale);
    expect(Math.max(...all)).toBe(digitScale(6));
    expect(Math.min(...all)).toBe(digitScale(12));
    // Los de dos cifras se angostan para entrar en la ficha, a igual probabilidad.
    expect(digitScale(10)).toBeLessThan(digitScale(4));
    expect(digitScale(11)).toBeLessThan(digitScale(3));
  });

  it("el ladrón oscurece la loseta que deja sin producir, pero no la arena del desierto", () => {
    const none = new Set<string>();
    expect(tileTint("d", "desierto", none, undefined, "d")).toBe(TILE_TINT.base);
    expect(tileTint("m", "mineral", none, undefined, "m")).toBe(TILE_TINT.robbed);
    expect(tileTint("d", "desierto", new Set(["d"]), undefined, "d")).toBe(TILE_TINT.highlighted);
  });

  it("el ladrón se para detrás de la ficha, sin pisarla ni salir de su loseta; en el desierto, al centro", () => {
    const apothem = (S * Math.sqrt(3)) / 2;
    for (const [q, r] of [[0, 0], [2, -1], [-1, 2]] as const) {
      const c = hexToPixel(q, r, S);
      const s = robberSpot({ q, r, number: 8 });
      // Del lado lejano a la cámara: el número bloqueado queda delante del peón.
      expect(s.y).toBeLessThan(c.y);
      const d = Math.hypot(s.x - c.x, s.y - c.y);
      expect(d).toBeGreaterThanOrEqual(TOKEN_R + ROBBER_FOOT_R);
      // Ni los caminos de las aristas (medio ancho ~0,065) ni un poblado en el vértice de atrás.
      expect(d + ROBBER_FOOT_R).toBeLessThan(apothem - 0.065);
      expect(Math.hypot(s.x - c.x, s.y - (c.y - S)) - ROBBER_FOOT_R).toBeGreaterThan(0.15);
      const desert = robberSpot({ q, r, number: null });
      expect(desert.x).toBeCloseTo(c.x, 9);
      expect(desert.y).toBeCloseTo(c.y, 9);
    }
  });

  it("liviano: marco más claro que la mesa y el brillo del barniz sigue al tema", () => {
    const y = (c: THREE.Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
    for (const theme of THEMES) {
      expect(y(liteWood("frame", theme).color)).toBeGreaterThan(y(liteWood("table", theme).color));
    }
    const glow = (t: (typeof THEMES)[number]) => y(liteWood("frame", t).emissive);
    expect(glow("noche")).toBeLessThan(glow("atardecer"));
    expect(glow("atardecer")).toBeLessThan(glow("dia"));
  });

  it("las montañas también giran de a 60°: dos losetas iguales no se ven calcadas", () => {
    const ids = Array.from({ length: 12 }, (_, i) => `${i - 6},${(i * 5) % 7 - 3}`);
    const spins = new Set(ids.map((id) => tileSpin(id, "mineral")));
    expect(spins.size).toBeGreaterThan(2);
    for (const s of spins) expect(Math.round((s / (Math.PI / 3)) * 1e6) / 1e6 % 1).toBe(0);
  });
});

describe("bosques, ladrilleras y piezas", () => {
  const corners = Array.from({ length: 6 }, (_, i) => hexCorner({ x: 0, y: 0 }, S, i));
  const apothem = (S * Math.sqrt(3)) / 2;
  /** Distancia a la arista más cercana; un camino ocupa ~0,065 a cada lado de la suya. */
  const toEdge = (x: number, z: number) =>
    Math.min(...[0, 1, 2, 3, 4, 5].map((k) => apothem - (x * Math.cos((k * Math.PI) / 3) + z * Math.sin((k * Math.PI) / 3))));
  /** Media diagonal del zócalo del poblado (0,3 × 0,24) ya escalado. */
  const settleR = Math.hypot(0.15, 0.12) * PIECE_SCALE;
  const ids = ["0,0", "2,-1", "-1,2", "1,1", "-2,0", "0,-2"];

  it("doce pinos por bosque (cuatro en liviano) sin pisar la ficha, los caminos ni los poblados", () => {
    for (const per of [12, 4]) {
      for (const id of ids) {
        for (let k = 0; k < per; k++) {
          const p = forestPos(id, k, per);
          const r = TREE_BASE_R * p.s;
          expect(Math.hypot(p.x, p.z) - r).toBeGreaterThan(TOKEN_R);
          expect(toEdge(p.x, p.z) - r).toBeGreaterThan(0.065);
          for (const c of corners) expect(Math.hypot(p.x - c.x, p.z - c.y) - r).toBeGreaterThan(settleR);
        }
      }
    }
  });

  it("los ladrillos van en pilas de tres (dos abajo, uno cruzado arriba) lejos de ficha y vértices", () => {
    for (const stacks of [3, 2]) {
      for (const id of ids) {
        const poses = Array.from({ length: stacks * 3 }, (_, k) => brickPose(id, k, stacks));
        for (let s = 0; s < stacks; s++) {
          const [a, b, top] = poses.slice(s * 3, s * 3 + 3) as [typeof poses[0], typeof poses[0], typeof poses[0]];
          expect(a.y).toBeCloseTo(BRICK.h / 2, 9);
          expect(b.y).toBeCloseTo(BRICK.h / 2, 9);
          expect(top.y).toBeCloseTo(BRICK.h * 1.5, 9);
          expect(Math.hypot(a.x - b.x, a.z - b.z)).toBeCloseTo(BRICK.d + 0.008, 6);
          expect(Math.hypot(top.x - (a.x + b.x) / 2, top.z - (a.z + b.z) / 2)).toBeLessThan(1e-9);
          // Cruzado: entre ~70° y ~110° respecto de los de abajo.
          expect(Math.abs(Math.cos(top.yaw - a.yaw))).toBeLessThan(0.35);
        }
        const reach = Math.hypot(BRICK.l / 2, BRICK.d / 2);
        for (const p of poses) {
          expect(Math.hypot(p.x, p.z) - reach).toBeGreaterThan(TOKEN_R);
          expect(toEdge(p.x, p.z) - reach).toBeGreaterThan(0.065);
          for (const c of corners) expect(Math.hypot(p.x - c.x, p.z - c.y) - reach).toBeGreaterThan(settleR);
        }
      }
    }
  });

  it("tres ovejas por pastura (dos en liviano), cada una en su arista y sin pisarse", () => {
    for (const per of [3, 2]) {
      for (const id of ids) {
        const flock = Array.from({ length: per }, (_, k) => sheepPos(id, k, per));
        for (const p of flock) {
          const r = SHEEP_REACH * p.s;
          expect(Math.hypot(p.x, p.z) - r).toBeGreaterThan(TOKEN_R);
          expect(toEdge(p.x, p.z) - r).toBeGreaterThan(0.065);
          for (const c of corners) expect(Math.hypot(p.x - c.x, p.z - c.y) - r).toBeGreaterThan(settleR);
        }
        for (let a = 0; a < per; a++) {
          for (let b = a + 1; b < per; b++) {
            const pa = flock[a]!;
            const pb = flock[b]!;
            expect(Math.hypot(pa.x - pb.x, pa.z - pb.z)).toBeGreaterThan(SHEEP_REACH * (pa.s + pb.s));
          }
        }
      }
    }
  });

  it("los picos hacen un cordón detrás de la ficha: los altos al fondo, adelante sólo una piedra baja", () => {
    for (const per of [6, 3]) {
      for (const id of ids) {
        const poses = Array.from({ length: per }, (_, k) => peakPose(id, k, per));
        for (const p of poses) {
          const r = CRAG_R * p.sxz;
          expect(Math.hypot(p.x, p.z) - r).toBeGreaterThan(TOKEN_R);
          expect(toEdge(p.x, p.z) - r).toBeGreaterThan(0.065);
          for (const c of corners) expect(Math.hypot(p.x - c.x, p.z - c.y) - r).toBeGreaterThan(settleR);
          // −z es el lado lejano a la cámara: lo que queda adelante no puede tapar el número.
          if (p.z > 0.15) expect(CRAG_H * p.sy).toBeLessThan(0.18);
        }
        const tallest = [...poses].sort((a, b) => b.sy - a.sy).slice(0, 2);
        for (const t of tallest) expect(t.z).toBeLessThan(-0.3);
        expect(Math.max(...poses.map((p) => CRAG_H * p.sy))).toBeLessThan(0.45);
      }
    }
  });

  it("piezas más grandes que el modelo, pero el camino sigue cabiendo entre dos poblados", () => {
    expect(PIECE_SCALE).toBeGreaterThan(1);
    const gap = (S * (1 - ROAD_LEN)) / 2;
    // Media punta del camino debajo del zócalo, no de lado a lado del poblado.
    expect(gap).toBeGreaterThan(0.15 * PIECE_SCALE * 0.8);
    expect(gap).toBeLessThan(settleR);
  });
});

describe("cartón parejo y orientación", () => {
  it("las losetas se tocan: el radio a vértice es el del motor, sin rendija de mar", () => {
    expect(TILE_R_TOP).toBe(S);
  });

  it("todas las losetas tienen la misma cara superior; piezas apoyadas ahí", () => {
    const terrains: Terrain[] = ["madera", "ladrillo", "lana", "trigo", "mineral", "desierto"];
    for (const t of terrains) expect(hexHeight(t)).toBe(TILE_TOP);
    expect(PIECE_Y).toBe(TILE_TOP);
    const plate = makeHexPlate();
    plate.computeBoundingBox();
    expect(plate.boundingBox!.max.y).toBeCloseTo(TILE_TOP, 6);
    expect(plate.boundingBox!.min.y).toBeCloseTo(TILE_BOTTOM, 6);
  });

  it("el prisma del modo liviano apunta igual que los vértices del motor (en punta, sin giro de 30°)", () => {
    const g = prismGeo(TILE_TOP - TILE_BOTTOM);
    const pos = g.getAttribute("position");
    const corners = Array.from({ length: 6 }, (_, i) => hexCorner({ x: 0, y: 0 }, TILE_R_TOP, i));
    let matched = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      if (Math.hypot(x, z) < TILE_R_TOP * 0.99) continue;
      if (corners.some((c) => Math.hypot(c.x - x, c.y - z) < 0.02)) matched += 1;
    }
    expect(matched).toBeGreaterThanOrEqual(6);
  });
});
