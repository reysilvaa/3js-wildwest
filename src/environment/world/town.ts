import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { getModelsManifest, loadAsset, AssetKey } from "../assets.js";
import { getGroundHeightOnly } from "../terrain/height.js";
import { CollisionWorld } from "../../core/collision.js";

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
  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const dynamicLights: { light: THREE.PointLight | THREE.SpotLight; max: number }[] = [];

  // AAA Volumetric Window Light-Shaft Shader (1 shared material, Fresnel edge fade, 0 extra PointLights)
  const shaftUniforms = { uIntensity: { value: 0 } };
  const shaftMat = new THREE.ShaderMaterial({
    uniforms: shaftUniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide,
    vertexShader: `
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        vUv = uv;
        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
        vNormalV = normalize(normalMatrix * normal);
        vViewDir = normalize(-mvPos.xyz);
        gl_Position = projectionMatrix * mvPos;
      }
    `,
    fragmentShader: `
      uniform float uIntensity;
      varying vec2 vUv;
      varying vec3 vNormalV;
      varying vec3 vViewDir;
      void main() {
        // glTF flips UV.y relative to Blender: distT = 0.0 at window glass -> 1.0 at far ground end
        float distT = clamp(1.0 - vUv.y, 0.0, 1.0);
        // Soft kerosene/torch haze: gentle glow near window, feathers softly into darkness
        float startSoft = smoothstep(0.0, 0.14, distT);
        float lenFade = pow(smoothstep(0.92, 0.0, distT), 2.8) * startSoft;
        float sideSoft = pow(sin(clamp(vUv.x, 0.0, 1.0) * 3.14159265), 2.6);
        float fresnel = pow(abs(dot(normalize(vNormalV), normalize(vViewDir))), 2.5);
        float alpha = lenFade * fresnel * sideSoft * uIntensity * 0.14;
        if (alpha < 0.002) discard;
        vec3 col = mix(vec3(0.94, 0.52, 0.16), vec3(0.62, 0.20, 0.04), distT);
        gl_FragColor = vec4(col, alpha);
      }
    `,
  });
  const noopRaycast = () => {};
  const shaftMeshes: THREE.Mesh[] = [];

  // AAA Fixed 6-Light Dynamic Pool (warm 1885 oil-lamp/torch orange, 0 shader recompiles)
  const POOLED_LIGHT_COUNT = 6;
  const pooledLights: THREE.PointLight[] = [];
  for (let i = 0; i < POOLED_LIGHT_COUNT; i++) {
    const pl = new THREE.PointLight(0xe66e1e, 0, 15, 1.85);
    pl.position.set(0, -100, 0);
    scene.add(pl);
    pooledLights.push(pl);
  }
  const buildingLightAnchors: THREE.Vector3[] = [];

  interface TownLightsConfig {
    indoor?: Array<{ pos: [number, number, number]; color: number; maxIntensity: number; distance: number; decay: number }>;
    lanterns?: Array<[number, number, number]>;
    windowSpills?: Array<{ origin: [number, number, number]; target: [number, number, number]; angle: number; penumbra: number; distance: number; maxIntensity: number }>;
  }

  fetch("/models/town_lights.json")
    .then((res) => (res.ok ? res.json() : {}))
    .then((data: TownLightsConfig) => {
      for (const cfg of data.indoor ?? []) {
        const light = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
        light.position.set(...cfg.pos);
        scene.add(light);
        dynamicLights.push({ light, max: cfg.maxIntensity });
      }
      for (const pos of data.lanterns ?? []) {
        const light = new THREE.PointLight(0xffa34d, 0, 16, 2.0);
        light.position.set(...pos);
        scene.add(light);
        dynamicLights.push({ light, max: 2.2 });
      }
      for (const cfg of data.windowSpills ?? []) {
        const light = new THREE.SpotLight(0xffbe6b, 0, cfg.distance, cfg.angle, cfg.penumbra, 2.0);
        light.position.set(...cfg.origin);
        light.target.position.set(...cfg.target);
        scene.add(light, light.target);
        dynamicLights.push({ light, max: cfg.maxIntensity });
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
                  // Anchor point for the 6-light dynamic pool (illuminates NPCs & sand right in front of windows)
                  buildingLightAnchors.push(
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
                mesh.material = shaftMat;
                mesh.castShadow = false;
                mesh.receiveShadow = false;
                mesh.visible = false;
                mesh.raycast = noopRaycast;
                shaftMeshes.push(mesh);
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
                    // Glass window panes: low roughness, high specular bounce
                    if (!windowMaterials.includes(stdMat)) {
                      windowMaterials.push(stdMat);
                      stdMat.emissive.setHex(0xd96e1c);
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
    flickerPhase += dt;
    lightLodTimer += dt;
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

  let lastIndoorFactor = -1;
  let flickerPhase = 0;
  let lightLodTimer = 0;
  function setIndoorLighting(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    const active = clamped > 0.01;
    if (!active && lastIndoorFactor <= 0.01 && lastIndoorFactor >= 0) return;
    const factorChanged = Math.abs(clamped - lastIndoorFactor) >= 0.004;
    if (active && !factorChanged && lightLodTimer < 0.12) return;
    lightLodTimer = 0;
    lastIndoorFactor = clamped;

    const warmPulse = active
      ? 1.0 + Math.sin(flickerPhase * 6.3) * 0.045 + Math.sin(flickerPhase * 13.7) * 0.025
      : 0;
    for (let i = 0; i < windowMaterials.length; i++) {
      windowMaterials[i]!.emissiveIntensity = clamped * 2.4 * warmPulse;
    }

    // Light LOD without toggling light.visible (avoids Three.js GLSL shader recompilation spikes!)
    const camPos = camera.position;
    shaftUniforms.uIntensity.value = clamped * warmPulse;
    for (let i = 0; i < shaftMeshes.length; i++) {
      const m = shaftMeshes[i]!;
      const p = m.parent ? m.parent.position : m.position;
      m.visible = active && camPos.distanceToSquared(p) < 7225; // 85m LOD
    }
    // Assign fixed 6-light pool to the 6 buildings closest to camera focus (lights NPCs + ground with 0 shader recompiles!)
    const focusPos = controls.target;
    if (!active || buildingLightAnchors.length === 0) {
      for (let i = 0; i < pooledLights.length; i++) pooledLights[i]!.intensity = 0;
    } else {
      const scored = buildingLightAnchors
        .map((pos) => ({ pos, dSq: focusPos.distanceToSquared(pos) }))
        .sort((a, b) => a.dSq - b.dSq);
      for (let i = 0; i < pooledLights.length; i++) {
        const pl = pooledLights[i]!;
        const target = scored[i];
        if (!target || target.dSq > 2025) {
          pl.intensity = 0;
        } else {
          pl.position.copy(target.pos);
          const fade = target.dSq > 900 ? 1.0 - (Math.sqrt(target.dSq) - 30) / 15 : 1.0;
          pl.intensity = clamped * 4.2 * warmPulse * fade;
        }
      }
    }
    for (let i = 0; i < dynamicLights.length; i++) {
      const item = dynamicLights[i]!;
      if (!active) {
        item.light.intensity = 0;
        continue;
      }
      const dSq = camPos.distanceToSquared(item.light.position);
      if (dSq > 1600) {
        item.light.intensity = 0;
      } else {
        const lodFade = dSq > 784 ? 1.0 - (Math.sqrt(dSq) - 28) / 12 : 1.0;
        item.light.intensity = clamped * item.max * warmPulse * lodFade;
      }
    }
  }

  return { update, setIndoorLighting, getBuildings: () => buildings };
}

