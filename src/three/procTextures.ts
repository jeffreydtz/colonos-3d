import * as THREE from "three";
import type { Terrain } from "@shared/types";

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Los atlas de canvas se pintan una sola vez y quedan en caché: si la fuente web llega después
 * del primer pintado, el canvas quedaría con Georgia para siempre. Repinta cuando carga.
 */
export function repaintOnFont(font: string, repaint: () => void): void {
  if (typeof document === "undefined" || !document.fonts) return;
  void document.fonts
    .load(font)
    .then((faces) => {
      if (faces.length > 0) repaint();
    })
    .catch(() => {});
}

function tex(key: string, size: number, paint: (g: CanvasRenderingContext2D, n: number) => void): THREE.CanvasTexture {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const g = c.getContext("2d")!;
  paint(g, size);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = key.startsWith("alb:") ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.anisotropy = 4;
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  cache.set(key, t);
  return t;
}

function n2(x: number, y: number, s: number): number {
  return (
    Math.sin(x * 0.055 * s + y * 0.041) * 0.51 +
    Math.sin(x * 0.13 - y * 0.09 * s + 1.7) * 0.33 +
    Math.sin((x + y) * 0.21 + s) * 0.16
  );
}

function fillNoise(
  g: CanvasRenderingContext2D,
  n: number,
  rgb: (x: number, y: number, v: number, edge: number) => [number, number, number],
): void {
  const img = g.getImageData(0, 0, n, n);
  const d = img.data;
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const v = n2(x, y, 1.8);
      const dx = x / n - 0.5;
      const dy = y / n - 0.5;
      const edge = Math.max(0, Math.hypot(dx, dy) * 2 - 0.78) * 80;
      const [r, gc, b] = rgb(x, y, v, edge);
      const i = (y * n + x) * 4;
      d[i] = r;
      d[i + 1] = gc;
      d[i + 2] = b;
      d[i + 3] = 255;
    }
  }
  g.putImageData(img, 0, 0);
}

function clamp(n: number): number {
  return Math.max(0, Math.min(255, n));
}

function hash2(x: number, y: number, s: number): number {
  let h = Math.imul(x, 374761393) ^ Math.imul(y, 668265263) ^ Math.imul(s + 1, 1442695041);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}

/** Ruido de valor suave en [0, 1]: sin el patrón de rayas regulares que arman los senos. */
function vnoise(x: number, y: number, s: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const u = x - xi;
  const w = y - yi;
  const su = u * u * (3 - 2 * u);
  const sw = w * w * (3 - 2 * w);
  const a = hash2(xi, yi, s);
  const b = hash2(xi + 1, yi, s);
  const c = hash2(xi, yi + 1, s);
  const d = hash2(xi + 1, yi + 1, s);
  return a + (b - a) * su + (c - a) * sw + (a - b - c + d) * su * sw;
}

function fbm(x: number, y: number, s: number, octaves = 4): number {
  let sum = 0;
  let amp = 0.5;
  let f = 1;
  let norm = 0;
  for (let o = 0; o < octaves; o++) {
    sum += vnoise(x * f, y * f, s + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}

/**
 * Roca: manchas grandes, grano áspero y fisuras cortas que se cortan. Sin grano se leía como mármol
 * pulido; con vetas continuas, como mármol veteado; con celdas, como empedrado; el canto rodado
 * claro parecía sal y las crestas claras, papel de aluminio.
 */
function rock(x: number, y: number): { tone: number; fissure: number; grain: number } {
  const tone = fbm(x / 26, y / 26, 3, 5);
  const vein = 1 - Math.abs(fbm(x / 30, y / 30, 7) * 2 - 1);
  const broken = fbm(x / 14, y / 14, 29, 3) > 0.48 ? 1 : 0;
  const fissure = vein > 0.94 ? ((vein - 0.94) / 0.06) * broken : 0;
  return { tone, fissure, grain: hash2(x, y, 53) - 0.5 };
}

/** Laderas de arcilla: terrazas torcidas con canto claro y contrahuella oscura. */
function terraces(x: number, y: number, n: number): { step: number; clay: number } {
  const band = ((y / n) * 7 + fbm(x / 28, y / 28, 9) * 3.2) % 1;
  const step = band < 0.16 ? -1 : band < 0.24 ? -0.35 : band > 0.86 ? 0.5 : 0;
  return { step, clay: fbm(x / 12, y / 12, 10) - 0.5 };
}

/** Rebaño visto desde arriba: cuerpo de lana y cabeza oscura, alrededor de la ficha. */
function stampFlock(g: CanvasRenderingContext2D, n: number): void {
  const spots: Array<[number, number, number]> = [
    [0.22, 0.3, -0.5],
    [0.76, 0.26, 0.4],
    [0.18, 0.72, 0.6],
    [0.8, 0.7, -0.3],
    [0.5, 0.84, 0.1],
  ];
  for (const [u, v, rot] of spots) {
    const x = u * n;
    const y = v * n;
    const body = n * 0.055;
    g.fillStyle = "#f7f4ee";
    g.beginPath();
    g.ellipse(x, y, body, body * 0.72, rot, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#fbfaf6";
    g.beginPath();
    g.ellipse(x - body * 0.15, y - body * 0.08, body * 0.55, body * 0.4, rot, 0, Math.PI * 2);
    g.fill();
    const hx = x + Math.cos(rot) * body * 0.85;
    const hy = y + Math.sin(rot) * body * 0.85;
    g.fillStyle = "#3a342e";
    g.beginPath();
    g.ellipse(hx, hy, body * 0.32, body * 0.26, rot, 0, Math.PI * 2);
    g.fill();
  }
}

/** Pradera: manchones de pasto más claro y más oscuro, tréboles y alguna flor. */
function meadow(x: number, y: number): { patch: number; clover: boolean; flower: boolean } {
  return {
    patch: fbm(x / 20, y / 20, 4) - 0.5,
    clover: fbm(x / 6, y / 6, 8) > 0.62,
    flower: hash2(x >> 1, y >> 1, 31) > 0.992,
  };
}

/** Surcos de trigo apenas ondulados: rectos del todo se leían como pana. */
function furrow(x: number, y: number): number {
  return Math.sin(x * 0.48 + fbm(x / 40, y / 40, 12) * 4);
}

/**
 * Arena: cuatro o cinco lomos de duna con ladera suave y cara de caída corta, que aparecen y se
 * borran, y ondas de viento sólo en algunos manchones. Ondas parejas de punta a punta de la loseta
 * se leían como la veta de una tabla de pino.
 */
function sand(x: number, y: number): { dune: number; ripple: number } {
  const u = (x * 0.42 + y * 0.91) / 44 + fbm(x / 36, y / 36, 13) * 1.6;
  const s = u - Math.floor(u);
  const ridge = s < 0.78 ? s / 0.78 : (1 - s) / 0.22;
  const amp = 0.35 + fbm(x / 50, y / 50, 5) * 0.9;
  const patch = Math.max(0, Math.min(1, (fbm(x / 26, y / 26, 19) - 0.52) / 0.14));
  const warp = fbm(x / 14, y / 14, 17) * 6;
  return { dune: (ridge - 0.5) * amp, ripple: Math.sin((x * 0.5 + y * 0.87) * 0.62 + warp) * patch };
}

/**
 * Copas de árboles vistas desde arriba: cúpulas de radio variable que se pisan, con sombra entre
 * copas. Ruido con umbral se leía como camuflaje. La fila 0 del canvas queda del lado de la cámara,
 * así que la luz pintada viene de arriba a la derecha del canvas, como la key de adelante-derecha.
 */
function crowns(x: number, y: number): { dome: number; lit: number; hue: number } {
  const cell = 14;
  const cx = Math.floor(x / cell);
  const cy = Math.floor(y / cell);
  let dome = 0;
  let lit = 0;
  let hue = 0;
  for (let j = -1; j <= 1; j++) {
    for (let i = -1; i <= 1; i++) {
      const gx = cx + i;
      const gy = cy + j;
      const r = cell * (0.52 + hash2(gx, gy, 63) * 0.48);
      const dx = (x - (gx + 0.12 + hash2(gx, gy, 61) * 0.76) * cell) / r;
      const dy = (y - (gy + 0.12 + hash2(gx, gy, 62) * 0.76) * cell) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= 1) continue;
      const h = Math.sqrt(1 - d2);
      if (h <= dome) continue;
      dome = h;
      lit = Math.max(0, dx * 0.5 - dy * 0.45 + h * 0.74);
      hue = hash2(gx, gy, 64) - 0.5;
    }
  }
  return { dome, lit, hue };
}

export function terrainAlbedo(kind: Terrain): THREE.CanvasTexture {
  return tex(`alb:${kind}`, 192, (g, n) => {
    if (kind === "madera") {
      fillNoise(g, n, (x, y, _v, edge) => {
        const { dome, lit, hue } = crowns(x, y);
        const clump = (fbm(x / 34, y / 34, 4, 3) - 0.5) * 30;
        if (dome === 0) {
          return [clamp(14 + clump * 0.3 - edge), clamp(42 + clump * 0.5 - edge), clamp(24 + clump * 0.3 - edge)];
        }
        // Verde profundo: más claro que esto, el bosque se confundía con el pasto.
        const ao = 0.6 + 0.4 * dome;
        return [
          clamp((18 + lit * 30 + hue * 18) * ao + clump * 0.4 - edge),
          clamp((56 + lit * 60 + hue * 10) * ao + clump - edge),
          clamp((28 + lit * 22 - hue * 8) * ao + clump * 0.35 - edge),
        ];
      });
    } else if (kind === "ladrillo") {
      fillNoise(g, n, (x, y, _v, edge) => {
        const { step, clay } = terraces(x, y, n);
        const t = step * 40 + clay * 30;
        return [clamp(196 + t - edge), clamp(90 + t * 0.5 - edge), clamp(48 + t * 0.3 - edge)];
      });
    } else if (kind === "trigo") {
      fillNoise(g, n, (x, y, v, edge) => {
        const f = furrow(x, y) * 16;
        const head = Math.sin(y * 0.9 + x * 0.1) * 10;
        return [
          clamp(218 + f + v * 10 + head - edge),
          clamp(168 + f * 0.45 + v * 12 - edge),
          clamp(52 + v * 8 - edge),
        ];
      });
    } else if (kind === "lana") {
      fillNoise(g, n, (x, y, _v, edge) => {
        const { patch, clover, flower } = meadow(x, y);
        if (flower) return [clamp(236 - edge), clamp(230 - edge), clamp(196 - edge)];
        const c = clover ? 16 : 0;
        return [
          clamp(84 + patch * 34 + c * 0.6 - edge),
          clamp(160 + patch * 56 + c - edge),
          clamp(58 + patch * 18 - edge),
        ];
      });
      stampFlock(g, n);
    } else if (kind === "mineral") {
      fillNoise(g, n, (x, y, _v, edge) => {
        const { tone, fissure, grain } = rock(x, y);
        const base = 78 + tone * 64 + grain * 22 - fissure * 46;
        return [clamp(base - edge), clamp(base + 5 - edge), clamp(base + 15 - edge)];
      });
    } else {
      fillNoise(g, n, (x, y, _v, edge) => {
        const { dune, ripple } = sand(x, y);
        const r = ripple * 7;
        const grain = (hash2(x, y, 23) - 0.5) * 12;
        const pebble = hash2(x >> 1, y >> 1, 21) > 0.994 ? -40 : 0;
        // Arena tostada: con la luz cálida y el ACES, un beige más claro se lavaba a blanco.
        const base = dune * 40;
        return [
          clamp(190 + base + r + grain + pebble - edge),
          clamp(146 + base * 0.85 + r * 0.9 + grain * 0.9 + pebble - edge),
          clamp(90 + base * 0.6 + r * 0.6 + grain * 0.7 + pebble * 0.8 - edge * 0.6),
        ];
      });
    }
  });
}

export function terrainBump(kind: Terrain): THREE.CanvasTexture {
  return tex(`bump:${kind}`, 128, (g, n) => {
    // El bump va a 128 px y el albedo a 192: se muestrea en coordenadas del albedo para que coincidan.
    const k = 192 / n;
    fillNoise(g, n, (x, y, v) => {
      let h = 128;
      const ax = x * k;
      const ay = y * k;
      if (kind === "trigo") h += v * 28 + furrow(ax, ay) * 18;
      if (kind === "ladrillo") {
        const { step, clay } = terraces(ax, ay, 192);
        h += step * 56 + clay * 40;
      }
      if (kind === "lana") {
        const { patch, clover } = meadow(ax, ay);
        h += patch * 60 + (clover ? 20 : 0);
      }
      if (kind === "desierto") {
        const { dune, ripple } = sand(ax, ay);
        h += dune * 80 + ripple * 10;
      }
      if (kind === "mineral") {
        const { tone, fissure, grain } = rock(ax, ay);
        h += (tone - 0.5) * 110 - fissure * 70 + grain * 26;
      }
      if (kind === "madera") h += (crowns(ax, ay).dome - 0.45) * 130;
      const c = clamp(h);
      return [c, c, c];
    });
  });
}

export function terrainRough(kind: Terrain): THREE.CanvasTexture {
  return tex(`rough:${kind}`, 64, (g, n) => {
    fillNoise(g, n, (_x, _y, v) => {
      let r = 190 + v * 20;
      if (kind === "mineral") r = 96 + v * 36;
      if (kind === "desierto") r = 228 + v * 12;
      if (kind === "madera") r = 176 + v * 16;
      if (kind === "trigo") r = 168 + v * 18;
      if (kind === "ladrillo") r = 186 + v * 14;
      if (kind === "lana") r = 204 + v * 10;
      const c = clamp(r);
      return [c, c, c];
    });
  });
}

export function waterAlbedo(): THREE.CanvasTexture {
  return tex("alb:water", 256, (g, n) => {
    fillNoise(g, n, (x, y, v) => {
      const wave = Math.sin(x * 0.08 + y * 0.11) * 16 + Math.sin(y * 0.19 + x * 0.03) * 10;
      return [
        clamp(12 + wave * 0.25),
        clamp(78 + v * 14 + wave),
        clamp(118 + v * 18 + wave * 0.8),
      ];
    });
  });
}

export function waterBump(): THREE.CanvasTexture {
  return tex("bump:water", 128, (g, n) => {
    fillNoise(g, n, (x, y, v) => {
      const wave = Math.sin(x * 0.16 + y * 0.12) * 28 + v * 22;
      const c = clamp(128 + wave);
      return [c, c, c];
    });
  });
}

/** Paño verde de la bandeja de dados, con pelusa: liso y oscuro se leía como un hueco negro. */
export function feltAlbedo(): THREE.CanvasTexture {
  return tex("alb:felt", 128, (g, n) => {
    const img = g.createImageData(n, n);
    const d = img.data;
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const fuzz = hash2(x, y, 7) - 0.5;
        const mottle = fbm(x / 22, y / 22, 3, 3) - 0.5;
        const i = (y * n + x) * 4;
        d[i] = clamp(36 + fuzz * 12 + mottle * 10);
        d[i + 1] = clamp(88 + fuzz * 18 + mottle * 16);
        d[i + 2] = clamp(62 + fuzz * 14 + mottle * 12);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  });
}

const WOOD_URL = "/tex/wood_table_001_diff_1k.jpg";

let wood: { base: THREE.Texture; pending: Set<THREE.Texture>; ready: boolean } | null = null;

/**
 * Nogal Poly Haven (CC0). Una sola descarga y una sola subida a GPU: cada uso es un clon (comparte
 * `source`, repeat propio). Los clones no heredan la versión, así que al llegar la imagen se marcan
 * uno por uno; si no, quedan negros.
 */
export function woodTexture(repeatX: number, repeatY = repeatX, anisotropy = 8): THREE.Texture {
  if (!wood) {
    const pending = new Set<THREE.Texture>();
    const base = new THREE.TextureLoader().load(WOOD_URL, () => {
      if (!wood) return;
      wood.ready = true;
      for (const t of wood.pending) t.needsUpdate = true;
      wood.pending.clear();
    });
    wood = { base, pending, ready: false };
  }
  const t = wood.base.clone();
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeatX, repeatY);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = anisotropy;
  if (wood.ready) t.needsUpdate = true;
  else wood.pending.add(t);
  return t;
}

/** Suelta un clon de `woodTexture`. No toca la textura base. */
export function releaseWood(tex: THREE.Texture | null | undefined): void {
  if (!tex) return;
  wood?.pending.delete(tex);
  tex.dispose();
}

export const BUMP_SCALE: Record<Terrain, number> = {
  madera: 0.12,
  ladrillo: 0.18,
  trigo: 0.14,
  lana: 0.09,
  mineral: 0.22,
  desierto: 0.2,
};

export const SIDE_COLOR: Record<Terrain, string> = {
  madera: "#14351f",
  ladrillo: "#6b2410",
  trigo: "#8a6416",
  lana: "#365314",
  mineral: "#3f3f46",
  desierto: "#a1804a",
};
