import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const ASSET_MAP = {
  hotel: "/models/buildings/hotel.glb",
  saloon: "/models/buildings/saloon.glb",
  bank: "/models/buildings/bank.glb",
  sheriff: "/models/buildings/sheriff.glb",
  store: "/models/buildings/store.glb",
  office: "/models/buildings/office.glb",
  depot: "/models/buildings/depot.glb",
  house: "/models/buildings/house.glb",
  settlement: "/models/buildings/settlement.glb",

  windmill: "/models/structures/windmill.glb",
  water_tower: "/models/structures/water_tower.glb",
  well: "/models/structures/well.glb",

  cart: "/models/props/cart.glb",
  barrel: "/models/props/barrel.glb",
  bench: "/models/props/bench.glb",
  crates: "/models/props/crates.glb",
  hitching_post: "/models/props/hitching_post.glb",
  fence: "/models/props/fence.glb",
  telegraph_pole: "/models/props/telegraph_pole.glb",

  cloud: "/models/environment/cloud.glb",
  tumbleweed: "/models/environment/tumbleweed.glb",
  terrain: "/models/environment/terrain.glb",

  anim_idle: "/models/movement/idle.glb",
  anim_walk: "/models/movement/walk.glb",

  npc_001: "/models/npc/characters/npc_001.glb",
  npc_002: "/models/npc/characters/npc_002.glb",
  npc_003: "/models/npc/characters/npc_003.glb",
  hat_001: "/models/npc/modular/accessories/hat/hat_001.glb",
  holster_001: "/models/npc/modular/accessories/holster/holster_001.glb",
  holster_002: "/models/npc/modular/accessories/holster/holster_002.glb",
} as const;

export type AssetKey = keyof typeof ASSET_MAP;

const loader = new GLTFLoader();
const assetCache = new Map<AssetKey, THREE.Group>();

/**
 * Loads and caches a modular asset by its category key
 */
export async function loadAsset(name: AssetKey): Promise<THREE.Group> {
  const cached = assetCache.get(name);
  if (cached) return cached.clone(true);

  const url = ASSET_MAP[name];

  return new Promise((resolve, reject) => {
    loader.load(
      url,
      (gltf) => {
        const root = gltf.scene;
        root.traverse((child) => {
          // SAFETY: Type assertion verified by Three.js isMesh property check
          if ((child as THREE.Mesh).isMesh) {
            const mesh = child as THREE.Mesh;
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        assetCache.set(name, root);
        resolve(root.clone(true));
      },
      undefined,
      (err) => reject(err)
    );
  });
}

export {
  createModelObject,
  type ModelObject,
  type ModelOptions,
} from "../core/models.js";


