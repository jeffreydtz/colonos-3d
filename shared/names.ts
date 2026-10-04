const RESERVED = /^(sistema|system|admin|servidor|null|undefined)$/i;

const HOMO: Record<string, string> = {
  а: "a",
  е: "e",
  о: "o",
  р: "p",
  с: "c",
  у: "y",
  х: "x",
  і: "i",
  ѕ: "s",
  Α: "a",
  Ο: "o",
  Ρ: "p",
  С: "c",
};

function foldHomoglyphs(s: string): string {
  return [...s]
    .map((ch) => HOMO[ch] ?? HOMO[ch.toLowerCase()] ?? ch)
    .join("")
    .toLowerCase();
}

/** ı/İ/i̇ y diacríticos caen a i/ascii antes de comparar con nombres reservados. */
function foldReserved(s: string): string {
  const turk = s.replace(/[ıİI]/g, "i");
  const stripped = turk.normalize("NFD").replace(/\p{M}+/gu, "");
  return foldHomoglyphs(stripped).replace(/[\s._'-]/g, "");
}

/** Nombres de asiento: sin RTL, sin homoglifos de Sistema, largo acotado. */
export function cleanPlayerName(
  raw: unknown,
  fallback = "Jugador",
): { ok: true; name: string } | { ok: false; error: string } {
  if (typeof raw !== "string") {
    return { ok: false, error: "Poné un nombre." };
  }
  if (raw.length > 40) {
    return { ok: false, error: "Ese nombre es demasiado largo." };
  }
  let s = raw.normalize("NFKC");
  s = s.replace(/[\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g, "");
  s = s.replace(/[^\p{L}\p{N} .'_-]/gu, "");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length > 18) {
    return { ok: false, error: "Ese nombre es demasiado largo." };
  }
  if (!s) s = fallback;
  const folded = foldReserved(s);
  if (RESERVED.test(s) || RESERVED.test(folded) || folded === "sistema") {
    return { ok: false, error: "Ese nombre está reservado." };
  }
  return { ok: true, name: s };
}
