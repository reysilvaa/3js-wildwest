import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadAsset, AssetKey } from "../assets.js";
import { getGroundHeightOnly } from "../terrain/height.js";
import { CollisionWorld } from "../../core/collision.js";

export interface TownInstance {
  asset: AssetKey;
  name?: string;
  pos: [number, number, number];
  rot: [number, number, number, number];
  scale?: [number, number, number];
}

export interface WorldOptions {
  layoutUrl?: string;
  onLoad?: (root: THREE.Group, bounds: THREE.Box3) => void;
}

export interface BuildingOccupant {
  readonly id: string;
  readonly name: string;
  readonly portraitUrl: string;
}

export interface InteractiveBuilding {
  readonly id: string;
  readonly label: string;
  readonly entryPos: THREE.Vector3;
  readonly doorPos: THREE.Vector3;
  readonly roofPos: THREE.Vector3;
  readonly doorPivot: THREE.Object3D;
  readonly occupants: BuildingOccupant[];
  openTimer: number;
  openAngle: number;
}

export function triggerBuildingDoor(building: InteractiveBuilding, duration = 1.8): void {
  building.openTimer = Math.max(building.openTimer, duration);
}

export interface WorldContext {
  update: (dt: number) => void;
  setIndoorLighting: (intensity: number) => void;
  getBuildings: () => readonly InteractiveBuilding[];
}

const BUILDING_ASSETS = new Set([
  "hotel", "saloon", "bank", "sheriff", "store",
  "office", "depot", "house", "settlement", "water_tower", "windmill",
]);
const SOLID_OBSTACLE_ASSETS = new Set([
  ...BUILDING_ASSETS,
  "cart", "well", "fence", "crates", "bench", "hitching_post",
]);

export function loadWorld(
  scene: THREE.Scene,
  controls: OrbitControls,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
  buildingBoxes: THREE.Box3[],
  options: WorldOptions = {}
): WorldContext {
  const { layoutUrl = "/models/town_layout.json", onLoad } = options;
  const townRoot = new THREE.Group();
  townRoot.name = "ModularTown";
  scene.add(townRoot);

  const windmillBladesList: THREE.Object3D[] = [];
  const buildings: InteractiveBuilding[] = [];
  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const porchLights: THREE.PointLight[] = [];

  interface TownLightsConfig {
    indoor?: Array<{
      id: string;
      pos: [number, number, number];
      color: number;
      maxIntensity: number;
      distance: number;
      decay: number;
    }>;
    lanterns?: Array<[number, number, number]>;
    windowSpills?: Array<{
      origin: [number, number, number];
      target: [number, number, number];
      angle: number;
      penumbra: number;
      distance: number;
      maxIntensity: number;
    }>;
  }

  const indoorLights: { light: THREE.PointLight; maxIntensity: number }[] = [];
  const windowSpillLights: { light: THREE.SpotLight; maxIntensity: number }[] = [];

  fetch("/models/town_lights.json")
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: TownLightsConfig) => {
      if (data.indoor) {
        for (const cfg of data.indoor) {
          const light = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
          light.position.set(...cfg.pos);
          light.visible = false;
          scene.add(light);
          indoorLights.push({ light, maxIntensity: cfg.maxIntensity });
        }
      }

      if (data.lanterns) {
        for (const pos of data.lanterns) {
          const pl = new THREE.PointLight(0xffa34d, 0, 16, 2.0);
          pl.position.set(...pos);
          pl.visible = false;
          scene.add(pl);
          porchLights.push(pl);
        }
      }

      if (data.windowSpills) {
        for (const cfg of data.windowSpills) {
          const spot = new THREE.SpotLight(0xffbe6b, 0, cfg.distance, cfg.angle, cfg.penumbra, 2.0);
          spot.position.set(...cfg.origin);
          spot.target.position.set(...cfg.target);
          spot.visible = false;
          scene.add(spot);
          scene.add(spot.target);
          windowSpillLights.push({ light: spot, maxIntensity: cfg.maxIntensity });
        }
      }
    })
    .catch((err) => console.warn("Failed to load town lights:", err));

  const loadingEl = document.getElementById("loading");
  const progressEl = document.getElementById("progress");
  const statusEl = document.getElementById("status-text");

  fetch(layoutUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return res.json() as Promise<TownInstance[]>;
    })
    .then(async (instances) => {
      const total = instances.length;
      let loaded = 0;

      for (const inst of instances) {
        try {
          const model = await loadAsset(inst.asset);
          const groundY = getGroundHeightOnly(inst.pos[0], inst.pos[2]);
          model.position.set(inst.pos[0], groundY + inst.pos[1], inst.pos[2]);
          model.quaternion.set(...inst.rot);
          if (inst.scale) model.scale.set(...inst.scale);

          // Force full world matrix update so setFromObject uses exact world coordinates
          model.updateMatrixWorld(true);

          if (inst.asset === "windmill") {
            const blades =
              model.getObjectByName("Cylinder005") ||
              model.getObjectByName("Cylinder.005");
            if (blades) windmillBladesList.push(blades);
          }

          const isBuilding = BUILDING_ASSETS.has(inst.asset);
          const isSolid = SOLID_OBSTACLE_ASSETS.has(inst.asset);

          if (isSolid) {
            const wholeBox = new THREE.Box3().setFromObject(model);
            if (wholeBox.max.y - wholeBox.min.y > 0.25) {
              if (isBuilding) {
                // Keep outer boardwalk walkable while solid building walls block NPCs
                wholeBox.min.x += 0.4;
                wholeBox.max.x -= 0.4;
                wholeBox.min.z += 0.4;
                wholeBox.max.z -= 0.4;
              }
              buildingBoxes.push(wholeBox);
              CollisionWorld.getInstance().addBox(wholeBox);

              if (isBuilding) {
                const doorPivot = model.getObjectByName("DoorPivot");
                const doorEntry = model.getObjectByName("DoorEntry");
                if (doorPivot && doorEntry) {
                  const entryPos = new THREE.Vector3();
                  const doorPos = new THREE.Vector3();
                  doorEntry.getWorldPosition(entryPos);
                  doorPivot.getWorldPosition(doorPos);
                  entryPos.y = getGroundHeightOnly(entryPos.x, entryPos.z);

                  const roofPos = new THREE.Vector3(
                    (wholeBox.min.x + wholeBox.max.x) * 0.5,
                    wholeBox.max.y + 1.1,
                    (wholeBox.min.z + wholeBox.max.z) * 0.5
                  );
                  buildings.push({
                    id: inst.name ?? `${inst.asset}_${buildings.length}`,
                    label: inst.asset.toUpperCase(),
                    entryPos,
                    doorPos,
                    roofPos,
                    doorPivot,
                    occupants: [],
                    openTimer: 0,
                    openAngle: 0,
                  });
                }
              }
            }
          }

          model.traverse((child) => {
            // SAFETY: Type assertion verified by Three.js isMesh property check
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.receiveShadow = true;
              mesh.castShadow = isBuilding && !mesh.name.includes("Cylinder005");
              mesh.frustumCulled = true;

              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mat of mats) {
                if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const stdMat = mat as THREE.MeshStandardMaterial;
                  stdMat.envMapIntensity = 1.0;

                  if (stdMat.emissive && (stdMat.emissive.r > 0.05 || stdMat.emissive.g > 0.05)) {
                    // Glass window panes: low roughness, high specular bounce
                    if (!windowMaterials.includes(stdMat)) {
                      windowMaterials.push(stdMat);
                      stdMat.emissiveIntensity = 0; // Off by default during bright day
                    }
                    stdMat.roughness = 0.16;
                    stdMat.metalness = 0.08;
                  } else if (
                    mesh.name.includes("Metal") ||
                    stdMat.name.includes("Metal") ||
                    stdMat.name.includes("Bell") ||
                    stdMat.name.includes("Chimney")
                  ) {
                    stdMat.roughness = 0.35;
                    stdMat.metalness = 0.82;
                  } else {
                    stdMat.roughness = 0.82;
                    stdMat.metalness = 0.04;
                  }
                }
              }
            }
          });

          townRoot.add(model);
        } catch (err) {
          console.warn(`Failed to load asset ${inst.asset}:`, err);
        }

        loaded++;
        const percent = Math.round((loaded / total) * 100);
        if (progressEl) progressEl.style.width = `${percent}%`;
        if (statusEl) statusEl.textContent = `Assembling Town... ${percent}%`;
      }

      const bbox = new THREE.Box3().setFromObject(townRoot);
      controls.target.set(10.0, 1.5, -6.0);
      camera.position.set(10.0, 14.0, 28.0);
      controls.update();

      renderer.shadowMap.needsUpdate = true;

      if (loadingEl) {
        loadingEl.style.opacity = "0";
        setTimeout(() => loadingEl.remove(), 500);
      }

      onLoad?.(townRoot, bbox);
    })
    .catch((err) => {
      console.error("Failed to load modular town layout:", err);
      if (statusEl) statusEl.textContent = "Failed to load town layout.";
    });

  function update(dt: number): void {
    const spin = 1.2 * dt;
    for (let i = 0; i < windmillBladesList.length; i++) {
      windmillBladesList[i]!.rotateY(spin);
    }
    const doorStep = Math.min(1, 7.5 * dt);
    for (let i = 0; i < buildings.length; i++) {
      const b = buildings[i]!;
      if (b.openTimer > 0) b.openTimer = Math.max(0, b.openTimer - dt);
      const targetAngle = b.openTimer > 0 ? 1.45 : 0;
      if (Math.abs(b.openAngle - targetAngle) > 0.002) {
        b.openAngle += (targetAngle - b.openAngle) * doorStep;
        b.doorPivot.rotation.y = b.openAngle;
      }
    }
  }

  function setIndoorLighting(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    const active = clamped > 0.01;
    for (const mat of windowMaterials) {
      mat.emissiveIntensity = clamped * 2.8;
      mat.emissive.setHex(0xffcb73);
    }
    for (const item of indoorLights) {
      item.light.visible = active;
      if (active) item.light.intensity = clamped * item.maxIntensity;
    }
    for (const pl of porchLights) {
      pl.visible = active;
      if (active) pl.intensity = clamped * 2.2;
    }
    for (const beam of windowSpillLights) {
      beam.light.visible = active;
      if (active) beam.light.intensity = clamped * beam.maxIntensity;
    }
  }

  return { update, setIndoorLighting, getBuildings: () => buildings };
}

