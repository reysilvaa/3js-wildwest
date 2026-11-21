import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { loadAsset, AssetKey } from "./assets.js";

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

export interface WorldContext {
  update: (dt: number) => void;
  setIndoorLighting: (intensity: number) => void;
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

  let windmillBlades: THREE.Object3D | null = null;
  const windowMaterials: THREE.MeshStandardMaterial[] = [];
  const porchLights: THREE.PointLight[] = [];

  interface IndoorLightConfig {
    id: string;
    pos: [number, number, number];
    color: number;
    maxIntensity: number;
    distance: number;
    decay: number;
  }

  const indoorLights: { light: THREE.PointLight; maxIntensity: number }[] = [];

  // Load Blender-positioned indoor lights
  fetch("/models/indoor_lights.json")
    .then((res) => (res.ok ? res.json() : []))
    .then((configs: IndoorLightConfig[]) => {
      for (const cfg of configs) {
        const light = new THREE.PointLight(cfg.color, 0, cfg.distance, cfg.decay);
        light.position.set(...cfg.pos);
        scene.add(light);
        indoorLights.push({ light, maxIntensity: cfg.maxIntensity });
      }
    })
    .catch((err) => console.warn("Failed to load indoor lights:", err));

  // Warm entrance lantern point lights on wooden porches for key buildings
  const lanternSpots: [number, number, number][] = [
    [16.2, 2.4, -11.5],  // Saloon boardwalk
    [10.5, 2.6, -22.0],  // Hotel grand entrance
    [3.2, 2.4, 6.5],     // Bank boardwalk
    [16.0, 2.4, 0.5],    // Sheriff boardwalk
    [16.0, 2.4, 12.5],   // General Store boardwalk
    [2.6, 2.4, -15.0],   // Depot platform
    [15.5, 2.4, -29.0],  // Office boardwalk
  ];

  for (const pos of lanternSpots) {
    const pl = new THREE.PointLight(0xffa34d, 0, 16, 2.0);
    pl.position.set(...pos);
    scene.add(pl);
    porchLights.push(pl);
  }

  // Soft directional window spill spotlights (indoor light projecting outward through window glass)
  interface WindowLightBeam {
    light: THREE.SpotLight;
    maxIntensity: number;
  }
  const windowSpillLights: WindowLightBeam[] = [];

  const windowSpillConfigs: {
    origin: [number, number, number];
    target: [number, number, number];
    angle: number;
    penumbra: number;
    distance: number;
    maxIntensity: number;
  }[] = [
    // Saloon front ground-floor glass -> casts onto wooden boardwalk & street
    {
      origin: [16.8, 2.3, -11.5],
      target: [10.5, 0.0, -11.5],
      angle: Math.PI / 3.0,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.8,
    },
    // Saloon front upper-floor windows -> soft cast into street
    {
      origin: [16.8, 4.8, -11.5],
      target: [9.5, 0.0, -11.5],
      angle: Math.PI / 3.2,
      penumbra: 0.9,
      distance: 16.0,
      maxIntensity: 3.5,
    },
    // General Store front display windows -> casts onto crates & boardwalk
    {
      origin: [16.2, 2.3, 12.8],
      target: [10.5, 0.0, 12.8],
      angle: Math.PI / 3.0,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.5,
    },
    // Sheriff office front window -> casts onto street
    {
      origin: [16.2, 2.3, 0.6],
      target: [10.5, 0.0, 0.6],
      angle: Math.PI / 3.0,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.2,
    },
    // Hotel grand entrance & facade windows -> casts into front plaza
    {
      origin: [10.5, 2.8, -22.5],
      target: [10.5, 0.0, -14.5],
      angle: Math.PI / 2.8,
      penumbra: 0.85,
      distance: 16.0,
      maxIntensity: 5.5,
    },
    // Bank front windows -> casts across west boardwalk into street
    {
      origin: [3.4, 2.3, 6.8],
      target: [9.5, 0.0, 6.8],
      angle: Math.PI / 3.0,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.5,
    },
    // Depot platform windows -> casts onto train platform & tracks
    {
      origin: [2.8, 2.2, -15.0],
      target: [8.5, 0.0, -15.0],
      angle: Math.PI / 3.0,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.2,
    },
    // Residential House front window
    {
      origin: [2.8, 2.0, -7.0],
      target: [8.0, 0.0, -7.0],
      angle: Math.PI / 3.2,
      penumbra: 0.85,
      distance: 13.0,
      maxIntensity: 3.8,
    },
    // Office front window
    {
      origin: [15.8, 2.2, -29.0],
      target: [10.5, 0.0, -29.0],
      angle: Math.PI / 3.2,
      penumbra: 0.85,
      distance: 14.0,
      maxIntensity: 4.0,
    },
  ];

  for (const cfg of windowSpillConfigs) {
    const spot = new THREE.SpotLight(0xffbe6b, 0, cfg.distance, cfg.angle, cfg.penumbra, 2.0);
    spot.position.set(...cfg.origin);
    spot.target.position.set(...cfg.target);
    scene.add(spot);
    scene.add(spot.target);
    windowSpillLights.push({ light: spot, maxIntensity: cfg.maxIntensity });
  }

  const loadingEl = document.getElementById("loading");
  const progressEl = document.getElementById("progress");
  const statusEl = document.getElementById("status-text");

  // Load modular town layout from categorized GLB models
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
          model.position.set(...inst.pos);
          model.quaternion.set(...inst.rot);
          if (inst.scale) model.scale.set(...inst.scale);

          // Force full world matrix update so setFromObject uses exact world coordinates
          model.updateMatrixWorld(true);

          // Track windmill blades for continuous spinning
          if (inst.asset === "windmill") {
            windmillBlades =
              model.getObjectByName("Cylinder005") ||
              model.getObjectByName("Cylinder.005") ||
              null;
          }

          if (inst.asset !== "terrain") {
            const wholeBox = new THREE.Box3().setFromObject(model);
            if (wholeBox.max.y - wholeBox.min.y > 0.4) {
              buildingBoxes.push(wholeBox);
            }
          }

          model.traverse((child) => {
            // SAFETY: Type assertion verified by Three.js isMesh property check
            if ((child as THREE.Mesh).isMesh) {
              const mesh = child as THREE.Mesh;
              mesh.receiveShadow = true;
              if (inst.asset !== "terrain" && !mesh.name.includes("Cylinder005")) {
                mesh.castShadow = true;
                const box = new THREE.Box3().setFromObject(mesh);
                if (box.max.y - box.min.y > 0.4) {
                  buildingBoxes.push(box);
                }
              }
              mesh.frustumCulled = true;

              // Configure PBR reflections for realistic sunlight & lamp bounce
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
                    // Metallic props: crisp metallic reflection
                    stdMat.roughness = 0.35;
                    stdMat.metalness = 0.82;
                  } else {
                    // Weathered timber & ground: realistic diffuse scatter with subtle specular
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
      const center = bbox.getCenter(new THREE.Vector3());
      controls.target.copy(center);
      camera.position.set(center.x + 2, center.y + 12, bbox.min.z - 10);
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
    if (windmillBlades) {
      // Windmill wheel axle is local Y in glTF space; rotateY spins blades cleanly around center hub
      windmillBlades.rotateY(1.2 * dt);
    }
  }

  function setIndoorLighting(factor: number): void {
    const clamped = Math.max(0, Math.min(1, factor));
    for (const mat of windowMaterials) {
      mat.emissiveIntensity = clamped * 2.8;
      mat.emissive.setHex(0xffcb73);
    }
    for (const item of indoorLights) {
      item.light.intensity = clamped * item.maxIntensity;
    }
    for (const pl of porchLights) {
      pl.intensity = clamped * 2.2;
    }
    for (const beam of windowSpillLights) {
      beam.light.intensity = clamped * beam.maxIntensity;
    }
  }

  return { update, setIndoorLighting };
}

