import { DEV_LABEL, DevIcon, DEV_KINDS, PortIcon, ResourceIcon, RESOURCE_SHAPE_KIND } from "./GameIcon";
import { RESOURCE_LABEL } from "@shared/constants";
import { RESOURCES } from "@shared/types";

const SIZES = [16, 24, 32, 48] as const;

/** Lámina de íconos originales: silueta, 16–48 px y daltonismo (gris). */
export function IconSheet() {
  return (
    <div
      className="pointer-events-auto absolute inset-0 z-40 overflow-y-auto bg-[#120c08]/95 p-4 text-amber-50 md:p-8"
      data-testid="icon-sheet"
    >
      <h1 className="display text-2xl md:text-3xl">Íconos de Colonos</h1>
      <p className="mt-1 max-w-xl text-sm text-amber-100/80">
        Cada recurso y cada carta tiene silueta propia (pino, pared, oveja, gavilla, roca; espada, imán,
        lamparita, cartel, copa; ancla para el puerto). Se distinguen en gris y a 16 px; el nombre sale
        como tooltip.
      </p>

      <h2 className="display mt-6 text-lg">Recursos · 24 px</h2>
      <div className="mt-2 flex flex-wrap items-end gap-4" data-testid="icon-row-res-24">
        {RESOURCES.map((r) => (
          <figure key={r} className="flex w-16 flex-col items-center gap-1">
            <ResourceIcon resource={r} size={24} />
            <figcaption className="text-center text-[10px] text-amber-100/70">
              {RESOURCE_SHAPE_KIND[r]}
            </figcaption>
          </figure>
        ))}
      </div>

      <h2 className="display mt-6 text-lg">Recursos · tamaños</h2>
      <div className="mt-2 space-y-3">
        {RESOURCES.map((r) => (
          <div key={r} className="flex items-center gap-3">
            {SIZES.map((s) => (
              <ResourceIcon key={s} resource={r} size={s} />
            ))}
            <span className="text-xs text-amber-100/80" aria-hidden>
              {RESOURCE_LABEL[r]}
            </span>
          </div>
        ))}
      </div>

      <h2 className="display mt-6 text-lg">Sin color (forma)</h2>
      <div className="mt-2 flex flex-wrap gap-4 grayscale" data-testid="icon-row-res-gray">
        {RESOURCES.map((r) => (
          <ResourceIcon key={r} resource={r} size={24} />
        ))}
      </div>

      <h2 className="display mt-6 text-lg">Cartas de desarrollo · 24 px</h2>
      <div className="mt-2 flex flex-wrap items-end gap-4" data-testid="icon-row-dev-24">
        {DEV_KINDS.map((k) => (
          <figure key={k} className="flex w-20 flex-col items-center gap-1">
            <DevIcon kind={k} size={24} />
            <figcaption className="text-center text-[10px] text-amber-100/70">{DEV_LABEL[k]}</figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        {DEV_KINDS.map((k) => (
          <DevIcon key={k} kind={k} size={48} />
        ))}
        <PortIcon size={48} />
      </div>

      <h2 className="display mt-6 text-lg">Sin color (cartas y puerto)</h2>
      <div className="mt-2 flex flex-wrap gap-4 grayscale" data-testid="icon-row-dev-gray">
        {DEV_KINDS.map((k) => (
          <DevIcon key={k} kind={k} size={24} />
        ))}
        <PortIcon size={24} />
      </div>
    </div>
  );
}
