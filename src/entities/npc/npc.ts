import * as THREE from "three";
import { NPC, type NPCOptions, type NPCController, type NPCZone } from "@/entities/npc/controller.js";
import { CollisionWorld } from "@/core/collision.js";
import type { InteractiveBuilding } from "@/environment/world/town.js";
import { IS_MOBILE } from "@/ui/mobile.js";

export * from "@/entities/npc/controller.js";
export * from "@/entities/npc/modular.js";
export * from "@/entities/npc/navigator.js";

export const registeredNPCs: NPCController[] = [];

const NPC_SPAWNS: ReadonlyArray<{ pos: [number, number, number]; zone: NPCZone }> = [
  // Town Center (14)
  { pos: [13.2, 0.45, -7.5], zone: "center" }, { pos: [6.8, 0.45, 7.0], zone: "center" },
  { pos: [13.0, 0.45, 0.5], zone: "center" }, { pos: [13.0, 0.45, 12.0], zone: "center" },
  { pos: [6.8, 0.45, -16.0], zone: "center" }, { pos: [10.2, 0.45, -3.5], zone: "center" },
  { pos: [6.8, 0.45, -6.5], zone: "center" }, { pos: [8.8, 0.45, 17.5], zone: "center" },
  { pos: [9.5, 0.45, -23.5], zone: "center" }, { pos: [10.0, 0.45, -1.0], zone: "center" },
  { pos: [11.5, 0.45, -14.0], zone: "center" }, { pos: [8.2, 0.45, 3.5], zone: "center" },
  { pos: [12.0, 0.45, 8.5], zone: "center" }, { pos: [7.5, 0.45, -11.5], zone: "center" },
  // South Main Street (8)
  { pos: [5.2, 0.0, 26.5], zone: "south" }, { pos: [15.0, 0.0, 31.0], zone: "south" },
  { pos: [4.8, 0.0, 39.5], zone: "south" }, { pos: [14.8, 0.0, 44.0], zone: "south" },
  { pos: [4.6, 0.0, 51.5], zone: "south" }, { pos: [15.8, 0.0, 55.0], zone: "south" },
  { pos: [4.8, 0.0, 62.5], zone: "south" }, { pos: [16.2, 0.0, 64.0], zone: "south" },
  // West Homesteads (5)
  { pos: [-21.5, 0.0, -10.0], zone: "west" }, { pos: [-23.0, 0.0, 4.0], zone: "west" },
  { pos: [-22.0, 0.0, 15.0], zone: "west" }, { pos: [-22.5, 0.0, 28.0], zone: "west" },
  { pos: [-24.0, 0.0, 42.0], zone: "west" },
  // East Frontier Outskirts (5)
  { pos: [33.0, 0.0, -12.0], zone: "east" }, { pos: [38.0, 0.0, 3.0], zone: "east" },
  { pos: [33.5, 0.0, 18.0], zone: "east" }, { pos: [34.0, 0.0, 32.0], zone: "east" },
  { pos: [35.0, 0.0, 48.0], zone: "east" },
];

const NPC_NAMES = [
  "Arthur", "Wyatt", "Doc", "Sadie", "Jack", "Hosea", "Bill", "Dutch",
  "Abigail", "John", "Charles", "Javier", "Lenny", "Micah", "Pearson", "Sean",
  "Kieran", "Josiah", "Uncle", "Reverend", "Caleb", "Eli", "Silas", "Boone",
  "Harlan", "Wade", "Cole", "Jesse", "Gideon", "Travis", "Beau", "Clint",
];

/**
 * Single-point of entry mutual separation pass using centralized CollisionWorld SSOT.
 */
export function resolveNPCCollisions(npcs: NPCController[]): void {
  CollisionWorld.getInstance().resolveEntitySeparation(npcs, 1.4);
}

/**
 * Spawns all zoned town residents with varied scale, walk speed, and modular western attire.
 */
export function spawnTownNPCs(
  scene: THREE.Scene,
  buildingBoxes: THREE.Box3[],
  camera: THREE.Camera,
  getBuildings: () => readonly InteractiveBuilding[]
): NPCController[] {
  // Mobile spawns 14 downtown/main-street NPCs (same lively feel, >55% less skinned GPU/CPU load)
  const spawns = IS_MOBILE ? NPC_SPAWNS.slice(0, 14) : NPC_SPAWNS;
  return spawns.map((spawn, i) =>
    initNPC(scene, buildingBoxes, camera, {
      name: NPC_NAMES[i] ?? `Resident ${i + 1}`,
      modelIndex: i,
      homeZone: spawn.zone,
      modularAccessory: "random",
      initialPos: spawn.pos,
      scale: 0.83 + (i % 3) * 0.02,
      walkSpeed: 1.02 + (i % 4) * 0.04,
      stationary: false,
      startActivityIndex: i,
      getBuildings,
    })
  );
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
