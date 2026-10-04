import type { DevKind, LogPiece } from "@shared/types";
import { DEV_LABEL, DevIcon } from "./icons/GameIcon";

const SIZE = "h-4 w-4 shrink-0 text-amber-100";

const DEV_OF: Partial<Record<string, DevKind>> = {
  caballero: "caballero",
  invento: "progreso_invento",
  monopolio: "progreso_monopolio",
  caminos: "progreso_caminos",
};

const PIECE_LABEL: Record<string, string> = {
  poblado: "Poblado",
  ciudad: "Ciudad",
  camino: "Camino",
  carta: "Carta de desarrollo",
  premio_camino: "Camino más largo",
  premio_ejercito: "Ejército más grande",
};

export function PieceIcon({ id }: { id?: string }) {
  const kind = (id ?? "pieza") as LogPiece | string;
  const dev = DEV_OF[kind];
  const label = dev ? DEV_LABEL[dev] : (PIECE_LABEL[kind] ?? "Pieza");
  return (
    <span className="inline-flex" role="img" aria-label={label} data-tip={label} data-testid="piece-icon" data-piece={kind}>
      {dev ? <DevIcon kind={dev} size={16} decorative /> : glyph(kind)}
    </span>
  );
}

function glyph(id: string) {
  switch (id) {
    case "poblado":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <path fill="currentColor" d="M8 1.6 14.4 8H12v6H4V8H1.6L8 1.6Z" />
        </svg>
      );
    case "ciudad":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <path fill="currentColor" d="M2 14V7.2L5 4.4V7l3-2.8V14H2Zm7-6h5v6H9V8Z" />
        </svg>
      );
    case "camino":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <path
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
            d="M3 12.5 13 3.5"
          />
        </svg>
      );
    case "carta":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <rect x="3.2" y="1.8" width="9.6" height="12.4" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path fill="currentColor" d="M8.8 1.8h4v4L8.8 1.8Z" />
        </svg>
      );
    case "premio_camino":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <path fill="currentColor" d="M8 1.2 9.5 5H14l-3.6 2.6L11.8 14 8 11.2 4.2 14l1.4-6.4L2 5h4.5L8 1.2Z" />
        </svg>
      );
    case "premio_ejercito":
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <path fill="currentColor" d="M8 1.4 13.2 4v4.2c0 3.2-2.1 5.4-5.2 6.4-3.1-1-5.2-3.2-5.2-6.4V4L8 1.4Z" />
        </svg>
      );
    default:
      return (
        <svg viewBox="0 0 16 16" className={SIZE} aria-hidden>
          <circle cx="8" cy="8" r="5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        </svg>
      );
  }
}
