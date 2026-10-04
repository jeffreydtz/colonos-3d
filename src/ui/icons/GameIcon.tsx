import type { ReactNode, SVGProps } from "react";
import { RESOURCE_LABEL } from "@shared/constants";
import { RESOURCES, type ClientView, type DevKind, type Resource } from "@shared/types";
import {
  ANCHOR_ART,
  DEV_ART,
  DEV_SHAPE_KIND,
  RESOURCE_ART,
  RESOURCE_SHAPE_KIND,
  paintLayers,
  type Layer,
} from "./iconArt";

export { DEV_SHAPE_KIND, RESOURCE_SHAPE_KIND };

export const DEV_LABEL: Record<DevKind, string> = {
  caballero: "Caballero",
  progreso_monopolio: "Monopolio",
  progreso_invento: "Invento",
  progreso_caminos: "Caminos",
  punto_victoria: "Punto de victoria",
};

export const DEV_KINDS: DevKind[] = [
  "caballero",
  "progreso_monopolio",
  "progreso_invento",
  "progreso_caminos",
  "punto_victoria",
];

export const CHAT_RESOURCE_TOKEN: Record<Resource, string> = {
  madera: ":madera:",
  ladrillo: ":ladrillo:",
  lana: ":lana:",
  trigo: ":trigo:",
  mineral: ":mineral:",
};

export const CHAT_DEV_TOKEN: Record<DevKind, string> = {
  caballero: ":caballero:",
  progreso_monopolio: ":monopolio:",
  progreso_invento: ":invento:",
  progreso_caminos: ":caminos:",
  punto_victoria: ":pv:",
};

type Common = {
  size?: number;
  /** Nombre del tooltip y de lectores de pantalla; por defecto, el del recurso o la carta. */
  title?: string;
  className?: string;
  /** Dentro de algo que ya se nombra (un botón, una fila con tooltip): sin nombre propio. */
  decorative?: boolean;
};

function Layers({ layers }: { layers: Layer[] }) {
  return (
    <>
      {layers.map((l, i) => {
        const round = l.t !== "path" || l.round;
        const paint = {
          fill: l.fill ?? "none",
          stroke: l.stroke,
          strokeWidth: l.stroke ? (l.sw ?? 1) : undefined,
          strokeLinecap: l.stroke && round ? ("round" as const) : undefined,
          strokeLinejoin: l.stroke && round ? ("round" as const) : undefined,
        };
        if (l.t === "path") return <path key={i} d={l.d} opacity={l.alpha} {...paint} />;
        if (l.t === "circle") return <circle key={i} cx={l.cx} cy={l.cy} r={l.r} {...paint} />;
        return (
          <ellipse
            key={i}
            cx={l.cx}
            cy={l.cy}
            rx={l.rx}
            ry={l.ry}
            transform={l.rot ? `rotate(${l.rot} ${l.cx} ${l.cy})` : undefined}
            {...paint}
          />
        );
      })}
    </>
  );
}

/**
 * La silueta es la identidad: sin caja de color ni texto al lado. El nombre vive en `data-tip`
 * (globo de `IconTips` al pasar el mouse o con toque largo) y en `aria-label`.
 */
function Glyph({
  layers,
  size,
  label,
  decorative,
  ...rest
}: { layers: Layer[]; size: number; label: string; decorative?: boolean } & Omit<SVGProps<SVGSVGElement>, "ref">) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : label}
      data-tip={decorative ? undefined : label}
      {...rest}
    >
      <Layers layers={layers} />
    </svg>
  );
}

export function ResourceIcon({ resource, size = 24, title, className, decorative }: Common & { resource: Resource }) {
  return (
    <Glyph
      layers={RESOURCE_ART[resource]}
      size={size}
      label={title ?? RESOURCE_LABEL[resource]}
      decorative={decorative}
      className={className}
      data-testid={`icon-res-${resource}`}
      data-resource={resource}
      data-shape={RESOURCE_SHAPE_KIND[resource]}
    />
  );
}

export function DevIcon({ kind, size = 24, title, className, decorative }: Common & { kind: DevKind }) {
  return (
    <Glyph
      layers={DEV_ART[kind]}
      size={size}
      label={title ?? DEV_LABEL[kind]}
      decorative={decorative}
      className={className}
      data-testid={`icon-dev-${kind}`}
      data-dev={kind}
      data-shape={DEV_SHAPE_KIND[kind]}
    />
  );
}

/** Ancla: el puerto genérico en el agua y la marca de tasa de puerto en la mano y el banco. */
export function PortIcon({ size = 16, title = "Puerto 3:1", className, decorative }: Common) {
  return (
    <Glyph
      layers={ANCHOR_ART}
      size={size}
      label={title}
      decorative={decorative}
      className={className}
      data-testid="icon-port"
      data-shape="anchor"
    />
  );
}

export type Rate = 2 | 3 | 4;

/** Nombre de la tasa para el tooltip: banco, puerto genérico o puerto de ese recurso. */
export function rateTip(resource: Resource, rate: Rate): string {
  if (rate === 2) return `Puerto de ${RESOURCE_LABEL[resource].toLowerCase()} 2:1`;
  if (rate === 3) return "Puerto 3:1";
  return "Banco 4:1";
}

/** Tasa de cambio: con ancla si sale de un puerto («⚓2:1», sin abreviar el nombre). */
export function RateTag({
  resource,
  rate,
  tip = false,
  className = "",
}: {
  resource: Resource;
  rate: Rate;
  /** Con tooltip propio; dentro de un botón que ya lo nombra, no. */
  tip?: boolean;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center gap-px tabular-nums ${className}`}
      data-tip={tip ? rateTip(resource, rate) : undefined}
      data-rate={rate}
    >
      {rate < 4 && <PortIcon size={11} decorative />}
      {rate}:1
    </span>
  );
}

export function ResourceQty({ resource, n, size = 24 }: { resource: Resource; n?: number; size?: number }) {
  const label = n != null ? `${RESOURCE_LABEL[resource]} ×${n}` : RESOURCE_LABEL[resource];
  return (
    <span className="inline-flex items-center gap-0.5" role="img" aria-label={label} data-tip={label}>
      <ResourceIcon resource={resource} size={size} decorative />
      {n != null && (
        <span className="text-xs font-bold tabular-nums" aria-hidden>
          {n}
        </span>
      )}
    </span>
  );
}

export function BagIcons({
  bag,
  size = 20,
  empty = "nada",
}: {
  bag: Partial<Record<Resource, number>>;
  size?: number;
  empty?: string;
}) {
  const parts = RESOURCES.filter((r) => (bag[r] ?? 0) > 0);
  if (!parts.length) return <span>{empty}</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      {parts.map((r) => (
        <ResourceQty key={r} resource={r} n={bag[r]} size={size} />
      ))}
    </span>
  );
}

export function ResourcePick({
  resource,
  selected,
  onClick,
  qty,
  disabled,
  size = 32,
}: {
  resource: Resource;
  selected?: boolean;
  onClick?: () => void;
  qty?: number;
  disabled?: boolean;
  size?: number;
}) {
  const label = RESOURCE_LABEL[resource];
  return (
    <button
      type="button"
      data-tip={label}
      aria-label={qty != null ? `${label}: ${qty}` : label}
      aria-pressed={selected}
      disabled={disabled}
      data-testid={`pick-res-${resource}`}
      onClick={onClick}
      className={`flex min-h-11 min-w-11 flex-col items-center justify-center gap-0.5 rounded-xl px-1.5 py-1 disabled:opacity-40 ${
        selected ? "bg-amber-200 text-stone-900 ring-2 ring-amber-100" : "bg-black/35 text-amber-50"
      }`}
    >
      <ResourceIcon resource={resource} size={size} decorative />
      {qty != null && <span className="text-sm font-bold tabular-nums leading-none">{qty}</span>}
    </button>
  );
}

const TOKEN_RE = /:(madera|ladrillo|lana|trigo|mineral|caballero|monopolio|invento|caminos|pv):/g;

const TOKEN_DEV: Record<string, DevKind> = {
  caballero: "caballero",
  monopolio: "progreso_monopolio",
  invento: "progreso_invento",
  caminos: "progreso_caminos",
  pv: "punto_victoria",
};

/** Texto con `:lana:` o `:caballero:` adentro: cada token se dibuja como su ícono. */
export function ChatRichText({ text, size = 16 }: { text: string; size?: number }) {
  const nodes: ReactNode[] = [];
  let last = 0;
  let i = 0;
  for (const m of text.matchAll(TOKEN_RE)) {
    const idx = m.index ?? 0;
    if (idx > last) nodes.push(<span key={`t-${i}`}>{text.slice(last, idx)}</span>);
    nodes.push(<ChatToken key={`i-${i}`} token={m[1]!} size={size} />);
    last = idx + m[0].length;
    i += 1;
  }
  if (last < text.length) nodes.push(<span key="tail">{text.slice(last)}</span>);
  return <>{nodes}</>;
}

function ChatToken({ token, size }: { token: string; size: number }) {
  const res = RESOURCES.find((r) => r === token);
  if (res) return <ResourceIcon resource={res} size={size} />;
  const kind = TOKEN_DEV[token];
  if (kind) return <DevIcon kind={kind} size={size} />;
  return <span>:{token}:</span>;
}

export function settlementPortRate(view: ClientView, playerId: string, resource: Resource): Rate {
  let general = false;
  for (const b of view.buildings) {
    if (b.playerId !== playerId) continue;
    const v = view.vertices.find((x) => x.id === b.vertexId);
    const port = v?.port;
    if (!port) continue;
    if (port.type === resource && port.ratio === 2) return 2;
    if (port.type === "general") general = true;
  }
  return general ? 3 : 4;
}

/** El mismo ícono en un canvas 2D (fichas de puerto en el agua). */
export function paintResource(g: CanvasRenderingContext2D, resource: Resource, x: number, y: number, s: number): void {
  paintLayers(g, RESOURCE_ART[resource], x, y, s);
}

export function paintAnchor(g: CanvasRenderingContext2D, x: number, y: number, s: number): void {
  paintLayers(g, ANCHOR_ART, x, y, s);
}
