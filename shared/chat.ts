export const CHAT_MAX_LEN = 160;
export const CHAT_RATE_WINDOW_MS = 8_000;
export const CHAT_RATE_MAX = 6;

const EMOTES: Array<[RegExp, string]> = [
  [/\:isla\:/gi, "🏝️"],
  [/\:dado\:/gi, "🎲"],
  [/\:fire\:/gi, "🔥"],
  [/\:up\:/gi, "👍"],
  [/<3/g, "❤️"],
  [/:D/g, "😄"],
  [/:\)/g, "🙂"],
  [/:\(/g, "🙁"],
];

export function extractChatBody(data: unknown): string {
  if (typeof data === "string") return data;
  if (data && typeof data === "object" && "text" in data && typeof (data as { text: unknown }).text === "string") {
    return (data as { text: string }).text;
  }
  return "";
}

export function sanitizeChat(raw: unknown): string {
  let s = typeof raw === "string" ? raw : String(raw ?? "");
  s = s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "");
  s = s.replace(/<[^>]*>/g, "");
  for (const [re, to] of EMOTES) s = s.replace(re, to);
  return s.trim().slice(0, CHAT_MAX_LEN);
}

export function chatAllowed(hits: number[], now = Date.now()): { ok: true; next: number[] } | { ok: false } {
  const windowed = hits.filter((t) => now - t < CHAT_RATE_WINDOW_MS);
  if (windowed.length >= CHAT_RATE_MAX) return { ok: false };
  windowed.push(now);
  return { ok: true, next: windowed };
}
