import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

export const ASSET_MAP = {
  // Buildings
  hotel: "/models/buildings/hotel.glb",
  saloon: "/models/buildings/saloon.glb",
  bank: "/models/buildings/bank.glb",
  sheriff: "/models/buildings/sheriff.glb",
  store: "/models/buildings/store.glb",
  office: "/models/buildings/office.glb",
  depot: "/models/buildings/depot.glb",
  house: "/models/buildings/house.glb",
  settlement: "/models/buildings/settlement.glb",

  // Structures
  windmill: "/models/structures/windmill.glb",
  water_tower: "/models/structures/water_tower.glb",
  well: "/models/structures/well.glb",

  // Props
  cart: "/models/props/cart.glb",
  barrel: "/models/props/barrel.glb",
  bench: "/models/props/bench.glb",
  crates: "/models/props/crates.glb",
  hitching_post: "/models/props/hitching_post.glb",
  fence: "/models/props/fence.glb",
  telegraph_pole: "/models/props/telegraph_pole.glb",

  // Environment
  cloud: "/models/environment/cloud.glb",
  tumbleweed: "/models/environment/tumbleweed.glb",
  terrain: "/models/environment/terrain.glb",

  // Characters & Movement
  anim_walk: "/models/movement/walk.glb",

  // Modular Character Parts
  npc_armature: "/models/npc/modular/armature/armature.glb",
  npc_head_default: "/models/npc/modular/heads/head_default.glb",
  npc_head_cowboy: "/models/npc/modular/heads/cowboy_head.glb",
  npc_hair_default: "/models/npc/modular/hair/hair_default.glb",
  npc_body_hands: "/models/npc/modular/bodies/body_hands.glb",
  npc_outfit_suit: "/models/npc/modular/outfits/outfit_suit.glb",
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

/**
 * Instantiates and places a modular asset at given coordinates
 */
export async function instantiateAsset(
  name: AssetKey,
  pos: [number, number, number] = [0, 0, 0],
  rotY = 0,
  scale = 1
): Promise<THREE.Group> {
  const model = await loadAsset(name);
  model.position.set(...pos);
  model.rotation.y = rotY;
  if (scale !== 1) model.scale.setScalar(scale);
  return model;
}

/**
 * Creates an autonomous reusable Windmill entity with its own blade spin update
 */
export async function createWindmill(
  pos: [number, number, number] = [0, 0, 0],
  rotY = 0
): Promise<{ model: THREE.Group; update: (dt: number) => void }> {
  const model = await instantiateAsset("windmill", pos, rotY);
  const blades = model.getObjectByName("Cylinder005") || model.getObjectByName("Cylinder.005");

  function update(dt: number) {
    if (blades) {
      blades.rotateY(1.2 * dt);
    }
  }

  return { model, update };
}

// Export Model Object Factory & System
export {
  createModelObject,
  initModels,
  type ModelObject,
  type ModelOptions,
  type ModelSystem,
  type ModelSystemOptions,
} from "../core/models.js";

