import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getModelsManifest, loadAsset, AssetKey } from "../assets.js";
import { getGroundHeightOnly } from "../terrain/height.js";
import { CollisionWorld } from "../../core/collision.js";
import { initTownLighting } from "./lighting.js";

export interface TownInstance {
  asset: AssetKey;
  name?: string;
  label?: string;
  icon?: string;
  solid?: boolean;
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
  readonly iconUrl?: string;
  readonly root: THREE.Object3D;
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
  const lighting = initTownLighting(scene, camera, controls);

  const loadingEl = document.getElementById("loading");
  const progressEl = document.getElementById("progress");
  const statusEl = document.getElementById("status-text");

  fetch(layoutUrl)
    .then((res) => {
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      return res.json() as Promise<TownInstance[]>;
    })
    .then(async (instances) => {
      const manifest = await getModelsManifest();
      const buildingAssets = new Set([...Object.keys(manifest.buildings), ...Object.keys(manifest.structures)]);
      const total = instances.length;
      let loaded = 0;
      // Parallel pre-warm unique GLBs instead of 20-step sequential network waterfall
      const uniqueAssets = [...new Set(instances.map((i) => i.asset))];
      await Promise.all(uniqueAssets.map((a) => loadAsset(a).catch(() => null)));

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

          const isBuilding = buildingAssets.has(inst.asset);
          const isSolid = inst.solid ?? isBuilding;

          if (isSolid) {
            // Detach WindowLightShafts before Box3 measurement so volumetric beams never inflate collision boxes
            const shaftsObj = model.getObjectByName("WindowLightShafts");
            const shaftsParent = shaftsObj?.parent ?? null;
            if (shaftsObj && shaftsParent) shaftsParent.remove(shaftsObj);
            const wholeBox = new THREE.Box3().setFromObject(model);
            if (shaftsObj && shaftsParent) shaftsParent.add(shaftsObj);
            if (wholeBox.max.y - wholeBox.min.y > 0.25) {
              const doorPivot = isBuilding ? model.getObjectByName("DoorPivot") : null;
              const doorEntry = isBuilding ? model.getObjectByName("DoorEntry") : null;

              if (isBuilding) {
                wholeBox.min.x += 0.5;
                wholeBox.max.x -= 0.5;
                wholeBox.min.z += 0.5;
                wholeBox.max.z -= 0.5;
              }

              if (isBuilding && doorPivot && doorEntry) {
                const entryPos = new THREE.Vector3();
                const doorPos = new THREE.Vector3();
                doorEntry.getWorldPosition(entryPos);
                doorPivot.getWorldPosition(doorPos);
                entryPos.y = getGroundHeightOnly(entryPos.x, entryPos.z);

                const outDir = entryPos.clone().sub(doorPos);
                outDir.y = 0;
                if (outDir.lengthSq() > 0.01) {
                  outDir.normalize();
                  // Trim solid wall box flush behind the door wall so the ENTIRE front porch is 100% free & walkable!
                  if (outDir.x > 0.5) wholeBox.max.x = Math.min(wholeBox.max.x, doorPos.x - 0.2);
                  else if (outDir.x < -0.5) wholeBox.min.x = Math.max(wholeBox.min.x, doorPos.x + 0.2);
                  if (outDir.z > 0.5) wholeBox.max.z = Math.min(wholeBox.max.z, doorPos.z - 0.2);
                  else if (outDir.z < -0.5) wholeBox.min.z = Math.max(wholeBox.min.z, doorPos.z + 0.2);

                  // Register raised boardwalk porch deck strictly over the physical wooden planks (0..1.75m from wall)
                  const deckTopY = entryPos.y + 0.42;
                  const halfDepth = 0.85;
                  const halfWidth = 3.9;
                  const sideX = Math.abs(outDir.z) * halfWidth + Math.abs(outDir.x) * halfDepth;
                  const sideZ = Math.abs(outDir.x) * halfWidth + Math.abs(outDir.z) * halfDepth;
                  const porchCx = doorPos.x + outDir.x * 0.90;
                  const porchCz = doorPos.z + outDir.z * 0.90;
                  CollisionWorld.getInstance().addWalkableSurface({
                    minX: porchCx - sideX,
                    maxX: porchCx + sideX,
                    minZ: porchCz - sideZ,
                    maxZ: porchCz + sideZ,
                    topY: deckTopY,
                  });
                  lighting.registerAnchor(
                    new THREE.Vector3(doorPos.x + outDir.x * 2.2, entryPos.y + 2.4, doorPos.z + outDir.z * 2.2)
                  );
                }

                const roofPos = new THREE.Vector3(
                  (wholeBox.min.x + wholeBox.max.x) * 0.5,
                  wholeBox.max.y + 1.1,
                  (wholeBox.min.z + wholeBox.max.z) * 0.5
                );
                const bldgId = inst.name ?? `${inst.asset}_${buildings.length}`;
                model.userData.buildingId = bldgId;
                buildings.push({
                  id: bldgId,
                  label: inst.label ?? inst.asset.toUpperCase(),
                  iconUrl: inst.icon,
                  root: model,
                  entryPos,
                  doorPos,
                  roofPos,
                  doorPivot,
                  occupants: [],
                  openTimer: 0,
                  openAngle: 0,
                });
              }

              buildingBoxes.push(wholeBox);
              CollisionWorld.getInstance().addBox(wholeBox);
            }
          }

          model.traverse((child) => {
            // SAFETY: Type assertion verified by Three.js isMesh property check
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              if (mesh.name === "WindowLightShafts") {
                lighting.registerLightShaft(mesh);
                return;
              }
              mesh.receiveShadow = true;
              mesh.castShadow = !mesh.name.includes("Cylinder005");
              mesh.frustumCulled = true;

              const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
              for (const mat of mats) {
                if (mat && (mat as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
                  const stdMat = mat as THREE.MeshStandardMaterial;
                  stdMat.envMapIntensity = 1.0;

                  if (stdMat.emissive && (stdMat.emissive.r > 0.05 || stdMat.emissive.g > 0.05)) {
                    lighting.registerWindowMaterial(stdMat);
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
      controls.target.set(9.5, 4.5, -16.0);
      camera.position.set(10.0, 11.5, 30.0);
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
    lighting.update(dt);
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

  return { update, setIndoorLighting: lighting.setFactor, getBuildings: () => buildings };
}

