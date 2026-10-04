import * as THREE from "three";
import { TOKENS, TERRAIN_3D } from "../theme/tokens";
import type { Terrain } from "@shared/types";

export type Quality = "normal" | "lite";

type MatBag = {
  table: THREE.Material;
  felt: THREE.Material;
  frame: THREE.Material;
  sea: THREE.Material;
  foam: THREE.Material;
  token: THREE.Material;
  outline: THREE.Material;
  robber: THREE.Material;
  dock: THREE.Material;
  piece: THREE.Material;
  tile: Record<string, THREE.Material>;
  tileSide: THREE.Material;
};

const cache = new Map<Quality, MatBag>();

function phys(params: THREE.MeshPhysicalMaterialParameters & { name: string }): THREE.MeshPhysicalMaterial {
  return new THREE.MeshPhysicalMaterial(params);
}

function lambert(params: THREE.MeshLambertMaterialParameters & { name: string }): THREE.MeshLambertMaterial {
  return new THREE.MeshLambertMaterial(params);
}

function build(q: Quality): MatBag {
  const lite = q === "lite";
  const tile: Record<string, THREE.Material> = {};
  for (const [id, t] of Object.entries(TERRAIN_3D)) {
    tile[id] = lite
      ? lambert({ color: t.base, name: `mat.tile.${id}` })
      : phys({
          color: t.base,
          roughness: id === "mineral" ? 0.55 : 0.88,
          metalness: id === "mineral" ? 0.12 : 0,
          sheen: id === "lana" || id === "madera" ? 0.25 : 0,
          sheenColor: id === "lana" ? "#cfe8a8" : "#3c8a4c",
          name: `mat.tile.${id}`,
        });
  }
  return {
    table: lite
      ? lambert({ color: TOKENS.tableWalnut, name: "mat.table" })
      : phys({ color: "#d8b896", roughness: 0.55, clearcoat: 0.2, clearcoatRoughness: 0.45, name: "mat.table" }),
    felt: lite
      ? lambert({ color: TOKENS.felt, name: "mat.felt" })
      : phys({
          color: TOKENS.felt,
          roughness: 0.95,
          sheen: 1,
          sheenColor: "#8a3a4a",
          sheenRoughness: 0.6,
          name: "mat.felt",
        }),
    frame: lite
      ? lambert({ color: TOKENS.frame, name: "mat.frame" })
      : phys({
          color: TOKENS.frame,
          roughness: 0.42,
          clearcoat: 0.6,
          clearcoatRoughness: 0.25,
          name: "mat.frame",
        }),
    sea: lite
      ? lambert({ color: TOKENS.seaDeep, vertexColors: true, name: "mat.sea" })
      : phys({
          color: TOKENS.seaDeep,
          roughness: 0.16,
          clearcoat: 1,
          clearcoatRoughness: 0.08,
          ior: 1.33,
          envMapIntensity: 1.2,
          vertexColors: true,
          name: "mat.sea",
        }),
    foam: new THREE.MeshBasicMaterial({
      color: TOKENS.seaFoam,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      name: "mat.sea.foam",
    }),
    token: lite
      ? lambert({ color: TOKENS.tokenCream, name: "mat.token" })
      : phys({
          color: TOKENS.tokenCream,
          roughness: 0.35,
          clearcoat: 0.45,
          clearcoatRoughness: 0.35,
          name: "mat.token",
        }),
    outline: new THREE.MeshBasicMaterial({ color: TOKENS.outline, side: THREE.BackSide, name: "mat.outline" }),
    robber: lite
      ? lambert({ color: "#3a3d42", name: "mat.robber" })
      : phys({ color: "#3e4147", roughness: 0.55, clearcoat: 0.35, clearcoatRoughness: 0.4, name: "mat.robber" }),
    dock: lite
      ? lambert({ color: "#5a3b22", name: "mat.dock" })
      : phys({ color: "#5a3b22", roughness: 0.7, name: "mat.dock" }),
    piece: lite
      ? lambert({ color: "#cccccc", name: "mat.piece" })
      : phys({ color: "#cccccc", roughness: 0.38, clearcoat: 0.7, clearcoatRoughness: 0.22, name: "mat.piece" }),
    tile,
    tileSide: lite
      ? lambert({ color: "#3b2a1c", name: "mat.tile.side" })
      : phys({ color: "#3b2a1c", roughness: 0.8, name: "mat.tile.side" }),
  };
}

export function getMaterials(quality: Quality): MatBag {
  let bag = cache.get(quality);
  if (!bag) {
    bag = build(quality);
    cache.set(quality, bag);
  }
  return bag;
}

export function tileMaterial(quality: Quality, terrain: Terrain): THREE.Material {
  return getMaterials(quality).tile[terrain] ?? getMaterials(quality).tile.desierto!;
}
