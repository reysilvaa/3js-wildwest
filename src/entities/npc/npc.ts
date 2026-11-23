import * as THREE from "three";
import { NPC, type NPCOptions, type NPCController } from "./controller.js";
import { CollisionWorld } from "../../core/collision.js";

export * from "./controller.js";
export * from "./modular.js";
export * from "./navigator.js";

export const registeredNPCs: NPCController[] = [];

/**
 * Single-point of entry mutual separation pass using centralized CollisionWorld SSOT.
 */
export function resolveNPCCollisions(npcs: NPCController[]): void {
  CollisionWorld.getInstance().resolveEntitySeparation(npcs, 1.4);
}

/**
 * Factory function to instantiate, load, and register an NPC in the scene.
 */
export function initNPC(
  scene: THREE.Scene,
  buildingBoxes: THREE.Box3[] = [],
  camera?: THREE.Camera,
  options: NPCOptions = {}
): NPCController {
  const collisionWorld = CollisionWorld.getInstance();
  if (buildingBoxes.length > 0) {
    collisionWorld.addBoxes(buildingBoxes);
  }

  const mergedOptions: NPCOptions = {
    ...options,
    camera: camera ?? options.camera,
    buildingBoxes,
  };

  const npc = new NPC(
    mergedOptions,
    collisionWorld,
    undefined,
    () => registeredNPCs
  );

  registeredNPCs.push(npc);
  npc.loadModel(scene).catch((err) => {
    console.error(`[initNPC] Failed to load 3D character for ${npc.name}:`, err);
  });

  return npc;
}
