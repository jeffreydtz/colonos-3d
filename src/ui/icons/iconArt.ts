import type { DevKind, Resource } from "@shared/types";

/**
 * Geometría de los íconos en una grilla de 24: la misma lista de capas dibuja el SVG del HUD y el
 * canvas de los carteles 3D. Cada recurso y cada carta tiene su propia silueta (pino, pared,
 * oveja, gavilla, roca; espada, imán, lamparita, cartel, copa): se distinguen sin color.
 */
export type Layer =
  | { t: "path"; d: string; fill?: string; stroke?: string; sw?: number; round?: boolean; alpha?: number }
  | { t: "circle"; cx: number; cy: number; r: number; fill?: string; stroke?: string; sw?: number }
  | { t: "ellipse"; cx: number; cy: number; rx: number; ry: number; rot?: number; fill?: string; stroke?: string; sw?: number };

const SHEEP_PUFFS: Array<[number, number, number]> = [
  [8.4, 10.8, 3.5],
  [12.2, 9.2, 3.7],
  [15.6, 11, 3.2],
  [10.2, 14, 3.3],
  [14.2, 14.2, 3.2],
  [6.6, 13.8, 2.6],
];

const WOOL = "#f6f1e6";
const WOOL_INK = "#2a2420";

export const RESOURCE_ART: Record<Resource, Layer[]> = {
  madera: [
    { t: "path", d: "M10.5 17.6h3v4h-3z", fill: "#7a4a26", stroke: "#0b3320", sw: 1 },
    {
      t: "path",
      d: "M12 1.6 16.7 7.7h-2.1l3.9 5.1h-2.4l4.2 5.6H3.7l4.2-5.6H5.5l3.9-5.1H7.3Z",
      fill: "#2f9a5c",
      stroke: "#0b3320",
      sw: 1.1,
      round: true,
    },
    { t: "path", d: "M12 3.6 9.6 6.8h1.3L8.4 10.4h1.4L7.2 14", stroke: "#8fd6a8", sw: 0.9, round: true, alpha: 0.7 },
  ],
  ladrillo: [
    { t: "path", d: "M2.6 6.4h18.8v11.2H2.6z", fill: "#c8572e" },
    {
      t: "path",
      d: "M2.6 12h18.8M8.8 6.4V12M15.2 6.4V12M5.6 12v5.6M12 12v5.6M18.4 12v5.6",
      stroke: "#f3d9c4",
      sw: 1.1,
    },
    { t: "path", d: "M2.6 6.4h18.8v11.2H2.6z", stroke: "#4a170a", sw: 1.2, round: true },
    { t: "path", d: "M3.8 7.6h4M10 7.6h4.2M16.4 7.6h3.8", stroke: "#e98a5f", sw: 0.8, alpha: 0.8 },
  ],
  lana: [
    { t: "path", d: "M7.6 16v4.2M10.4 16.6v4M13.6 16.6v4M16.2 16v4.2", stroke: WOOL_INK, sw: 1.5, round: true },
    ...SHEEP_PUFFS.map(([cx, cy, r]): Layer => ({ t: "circle", cx, cy, r, stroke: WOOL_INK, sw: 2.2 })),
    ...SHEEP_PUFFS.map(([cx, cy, r]): Layer => ({ t: "circle", cx, cy, r, fill: WOOL })),
    { t: "ellipse", cx: 18.3, cy: 11.6, rx: 2.4, ry: 2.9, rot: 18, fill: WOOL_INK },
    { t: "path", d: "M16.9 9.2 18.6 7.6 19.2 9.8Z", fill: WOOL_INK },
    { t: "circle", cx: 18.9, cy: 11, r: 0.55, fill: WOOL },
  ],
  trigo: [
    { t: "path", d: "M12 21V6.2M12 20.6 7.8 8.6M12 20.6l4.2-12", stroke: "#6b4a12", sw: 1.3, round: true },
    { t: "ellipse", cx: 7.9, cy: 8.2, rx: 1.8, ry: 3.4, rot: -20, fill: "#f2c14e", stroke: "#6b4a12", sw: 0.9 },
    { t: "ellipse", cx: 16.1, cy: 8.2, rx: 1.8, ry: 3.4, rot: 20, fill: "#f2c14e", stroke: "#6b4a12", sw: 0.9 },
    { t: "ellipse", cx: 12, cy: 6.4, rx: 2, ry: 3.9, fill: "#fbd977", stroke: "#6b4a12", sw: 0.9 },
    { t: "path", d: "M12 3.6v5.6M7.4 6.4l1 3.4M16.6 6.4l-1 3.4", stroke: "#b07d1e", sw: 0.6, round: true },
    { t: "path", d: "M9.4 14.2h5.2v1.9H9.4z", fill: "#9a6a1c", stroke: "#4f360b", sw: 0.9, round: true },
  ],
  mineral: [
    {
      t: "path",
      d: "M3.2 16.6 6.6 13.8 11.2 15 15.6 13.2 19.4 14.6 21.2 17.6 19.8 21.2 4.4 21.4Z",
      fill: "#8a93a4",
      stroke: "#1a2330",
      sw: 1.15,
      round: true,
    },
    {
      t: "path",
      d: "M6.4 14.4 8.8 7.8 13.8 6.2 16.2 10.2 13.4 14.8 9.2 15.2Z",
      fill: "#d5deea",
      stroke: "#1a2330",
      sw: 1.15,
      round: true,
    },
    { t: "path", d: "M12.6 6.8 13.8 6.2 16.2 10.2 13.4 14.8 12.2 11.4Z", fill: "#5c6778" },
    {
      t: "path",
      d: "M14.6 13.2 17.2 8.4 21.2 9.8 21.6 14.4 18.2 16.2Z",
      fill: "#b7c2d2",
      stroke: "#1a2330",
      sw: 1.15,
      round: true,
    },
    {
      t: "path",
      d: "M2.2 17.4 4.6 15.2 7.2 16.6 6.6 19.6 3.2 20.2Z",
      fill: "#6d7688",
      stroke: "#1a2330",
      sw: 1.1,
      round: true,
    },
    { t: "path", d: "M10.2 9.2 9.4 12.2M17.6 11.2 18.6 14.2M9.4 17.2 11.2 19.4", stroke: "#1a2330", sw: 0.85, round: true },
    { t: "path", d: "M9.4 8.6 11.6 8.2 12.2 10.4", stroke: "#f4f7fb", sw: 1.05, round: true },
  ],
};

export const DEV_ART: Record<DevKind, Layer[]> = {
  caballero: [
    { t: "path", d: "M12 1.8 13.8 4.3V15h-3.6V4.3Z", fill: "#e7ecf2", stroke: "#1f2937", sw: 1, round: true },
    { t: "path", d: "M12 4v10.4", stroke: "#9aa5b4", sw: 0.8 },
    { t: "path", d: "M6.4 15h11.2v2.2H6.4z", fill: "#b91c1c", stroke: "#3f0a0a", sw: 1, round: true },
    { t: "path", d: "M10.9 17.2h2.2v3.3h-2.2z", fill: "#6b3f1d", stroke: "#2b1a0b", sw: 0.9 },
    { t: "circle", cx: 12, cy: 21.4, r: 1.3, fill: "#b91c1c", stroke: "#3f0a0a", sw: 0.9 },
  ],
  progreso_monopolio: [
    {
      t: "path",
      d: "M4.2 3.4h4.6V12a3.2 3.2 0 0 0 6.4 0V3.4h4.6V12a7.8 7.8 0 0 1-15.6 0Z",
      fill: "#4a7be0",
      stroke: "#0d1b45",
      sw: 1.1,
      round: true,
    },
    { t: "path", d: "M4.2 3.4h4.6v3.6H4.2zM15.2 3.4h4.6v3.6h-4.6z", fill: "#e5e7eb", stroke: "#0d1b45", sw: 1 },
    { t: "path", d: "M6 14.6a6 6 0 0 0 3.4 3.6", stroke: "#bcd2fa", sw: 0.9, round: true, alpha: 0.85 },
  ],
  progreso_invento: [
    {
      t: "path",
      d: "M12 2.2a6.9 6.9 0 0 1 4.3 12.3v1.9H7.7v-1.9A6.9 6.9 0 0 1 12 2.2Z",
      fill: "#fde68a",
      stroke: "#3f2d07",
      sw: 1.05,
      round: true,
    },
    { t: "path", d: "M9.6 10.4l1.2 2.4 1.2-2.4 1.2 2.4 1.2-2.4", stroke: "#b45309", sw: 0.9, round: true },
    { t: "path", d: "M8.2 16.4h7.6v1.7H8.2zM8.8 18.1h6.4v1.6H8.8z", fill: "#2f7d4f", stroke: "#0f2e1c", sw: 0.9 },
    { t: "path", d: "M10.3 19.7h3.4l-.8 1.7h-1.8Z", fill: "#3f4650", stroke: "#1f2937", sw: 0.8 },
    { t: "path", d: "M9 5.4a4.4 4.4 0 0 0-1.4 3", stroke: "#fffbeb", sw: 1, round: true },
  ],
  progreso_caminos: [
    { t: "path", d: "M8.4 21.6h7.2", stroke: "#2b1a0b", sw: 1.3, round: true },
    { t: "path", d: "M11 5.4h2v16.2h-2z", fill: "#8a5a2b", stroke: "#2b1a0b", sw: 1 },
    { t: "path", d: "M13 3.4h6.4l2.2 2.4-2.2 2.4H13Z", fill: "#d6a35c", stroke: "#3b2408", sw: 1, round: true },
    { t: "path", d: "M11 9.6H4.6l-2.2 2.4 2.2 2.4H11Z", fill: "#d6a35c", stroke: "#3b2408", sw: 1, round: true },
    { t: "path", d: "M14.4 5.8h4.2M5.2 12h4.4", stroke: "#78350f", sw: 0.9, round: true },
  ],
  punto_victoria: [
    { t: "path", d: "M6.6 5.2H4.3a2.6 2.6 0 0 0 2.7 4.4M17.4 5.2h2.3a2.6 2.6 0 0 1-2.7 4.4", stroke: "#4a3405", sw: 1.3, round: true },
    {
      t: "path",
      d: "M6.5 3.2h11V8a5.5 5.5 0 0 1-11 0Z",
      fill: "#f2c94c",
      stroke: "#4a3405",
      sw: 1.05,
      round: true,
    },
    { t: "path", d: "M8.6 5v3a3.4 3.4 0 0 0 1.6 2.9", stroke: "#fff3c4", sw: 1, round: true },
    { t: "path", d: "M11 13.4h2v3.2h-2z", fill: "#d9a520", stroke: "#4a3405", sw: 0.9 },
    { t: "path", d: "M7.8 16.6h8.4v2.2H7.8zM6.6 18.8h10.8v2.2H6.6z", fill: "#854d0e", stroke: "#3a2104", sw: 0.9 },
  ],
};

const ANCHOR_SHANK = "M12 6.4v14M8.4 9.4h7.2M4.6 13.4c.4 4.2 3.6 6.8 7.4 6.8s7-2.6 7.4-6.8";
const ANCHOR_FLUKES = "M2.8 14.6 4.6 12.6l2 1.9M21.2 14.6l-1.8-2-2 1.9";
const ANCHOR_INK = "#0f2f3a";
const ANCHOR_CORE = "#6cc3d9";

/**
 * Ancla del puerto (3:1, y marca de puerto en la mano): núcleo claro con borde oscuro, como el
 * resto del set, para que se lea igual sobre el HUD oscuro y sobre la ficha crema del agua.
 */
export const ANCHOR_ART: Layer[] = [
  { t: "path", d: ANCHOR_SHANK, stroke: ANCHOR_INK, sw: 3.6, round: true },
  { t: "circle", cx: 12, cy: 4.4, r: 1.9, stroke: ANCHOR_INK, sw: 3.4 },
  { t: "path", d: ANCHOR_FLUKES, stroke: ANCHOR_INK, sw: 3.2, round: true },
  { t: "path", d: ANCHOR_SHANK, stroke: ANCHOR_CORE, sw: 1.8, round: true },
  { t: "circle", cx: 12, cy: 4.4, r: 1.9, stroke: ANCHOR_CORE, sw: 1.6 },
  { t: "path", d: ANCHOR_FLUKES, stroke: ANCHOR_CORE, sw: 1.4, round: true },
];

/** Silueta que identifica a cada recurso; la usan los tests de daltonismo y `data-shape`. */
export const RESOURCE_SHAPE_KIND: Record<Resource, "pine" | "wall" | "sheep" | "sheaf" | "rock"> = {
  madera: "pine",
  ladrillo: "wall",
  lana: "sheep",
  trigo: "sheaf",
  mineral: "rock",
};

export const DEV_SHAPE_KIND: Record<DevKind, "sword" | "magnet" | "bulb" | "signpost" | "trophy"> = {
  caballero: "sword",
  progreso_monopolio: "magnet",
  progreso_invento: "bulb",
  progreso_caminos: "signpost",
  punto_victoria: "trophy",
};

/** Dibuja capas en un canvas 2D, con el origen en (x, y) y lado `s` px. */
export function paintLayers(g: CanvasRenderingContext2D, layers: Layer[], x: number, y: number, s: number): void {
  g.save();
  g.translate(x, y);
  g.scale(s / 24, s / 24);
  for (const l of layers) {
    g.save();
    let shape: Path2D;
    if (l.t === "path") {
      shape = new Path2D(l.d);
      if (l.alpha != null) g.globalAlpha = l.alpha;
    } else if (l.t === "circle") {
      shape = new Path2D();
      shape.arc(l.cx, l.cy, l.r, 0, Math.PI * 2);
    } else {
      shape = new Path2D();
      shape.ellipse(l.cx, l.cy, l.rx, l.ry, ((l.rot ?? 0) * Math.PI) / 180, 0, Math.PI * 2);
    }
    if (l.fill) {
      g.fillStyle = l.fill;
      g.fill(shape);
    }
    if (l.stroke) {
      g.strokeStyle = l.stroke;
      g.lineWidth = l.sw ?? 1;
      const round = l.t !== "path" || l.round;
      g.lineCap = round ? "round" : "butt";
      g.lineJoin = round ? "round" : "miter";
      g.stroke(shape);
    }
    g.restore();
  }
  g.restore();
}

/** Las mismas capas como marcado SVG (hoja de muestra y tests sin DOM). */
export function layersToSvg(layers: Layer[]): string {
  const paint = (l: { fill?: string; stroke?: string; sw?: number }, round: boolean) =>
    `fill="${l.fill ?? "none"}"${l.stroke ? ` stroke="${l.stroke}" stroke-width="${l.sw ?? 1}"` : ""}${
      l.stroke && round ? ' stroke-linecap="round" stroke-linejoin="round"' : ""
    }`;
  return layers
    .map((l) => {
      if (l.t === "path") {
        return `<path d="${l.d}" ${paint(l, !!l.round)}${l.alpha != null ? ` opacity="${l.alpha}"` : ""}/>`;
      }
      if (l.t === "circle") return `<circle cx="${l.cx}" cy="${l.cy}" r="${l.r}" ${paint(l, true)}/>`;
      const rot = l.rot ? ` transform="rotate(${l.rot} ${l.cx} ${l.cy})"` : "";
      return `<ellipse cx="${l.cx}" cy="${l.cy}" rx="${l.rx}" ry="${l.ry}"${rot} ${paint(l, true)}/>`;
    })
    .join("");
}
