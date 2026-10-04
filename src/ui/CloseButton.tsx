/** Cruz de 40 px en la misma fila que las pestañas: no flota sobre el tablero ni repite el título. */
export function CloseButton({
  onClick,
  testId,
  label = "Cerrar",
}: {
  onClick: () => void;
  testId?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      aria-label={label}
      data-tip={label}
      className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-amber-100/80 hover:bg-white/10 hover:text-amber-50 focus-visible:outline-2 focus-visible:outline-amber-200"
    >
      <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6 6 18" />
      </svg>
    </button>
  );
}
