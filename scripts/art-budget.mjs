import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const round = (() => {
  const i = process.argv.indexOf("--round");
  return i >= 0 ? String(process.argv[i + 1]) : null;
})();

const BUDGET = {
  liviano: { calls: 70, triangles: 110_000 },
  normal: { calls: 110, triangles: 250_000 },
  alto: { calls: 140, triangles: 350_000 },
};

const dir = round
  ? path.join(ROOT, "docs", "art", `ronda-${round}`)
  : path.join(ROOT, "docs", "art", "ronda-0");
const file = path.join(dir, "metrics.json");
if (!fs.existsSync(file)) {
  console.log("art:budget: sin metrics.json (ronda 0 solo reporta)");
  process.exit(0);
}
const metrics = JSON.parse(fs.readFileSync(file, "utf8"));
let fail = 0;
for (const [name, m] of Object.entries(metrics)) {
  const tier = /_liviano_/.test(name) ? "liviano" : /_alto_/.test(name) ? "alto" : "normal";
  const b = BUDGET[tier];
  const overCalls = m.calls > b.calls;
  const overTris = m.triangles > b.triangles;
  console.log(
    `${name}: calls=${m.calls}/${b.calls} tris=${m.triangles}/${b.triangles} ${overCalls || overTris ? "OVER" : "ok"}`,
  );
  if (round && round !== "0" && (overCalls || overTris)) fail = 1;
}
if (!round || round === "0") {
  console.log("art:budget: ronda 0 reporta, no falla");
  process.exit(0);
}
process.exit(fail);
