import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { ModelObject } from "../../core/models.js";

export interface ModularPartsConfig {
  modelUrl?: string;
  accessoryUrl?: string;
  holsterUrl?: string;
  outfitColor?: number | THREE.Color;
  pantsColor?: number | THREE.Color;
  bootsColor?: number | THREE.Color;
  hatColor?: number | THREE.Color;
  holsterColor?: number | THREE.Color;
}

export const WESTERN_OUTFIT_PALETTE = [
  0x6b4423, // Rawhide Saddle Brown
  0xa68966, // Dusty Buckskin Tan
  0x262422, // Worn Undertaker Charcoal
  0x2f3e4e, // Faded Frontier Denim
  0x5c2422, // Aged Saloon Burgundy
  0x454e38, // Weathered Sage Olive
  0x7c3a25, // Sun-baked Frontier Rust
  0xb59e7d, // Sun-bleached Canvas Khaki
  0x4c4640, // Dusty Frontier Tweed
  0x4e2a1e, // Aged Mahogany Leather
];

export const WESTERN_PANTS_PALETTE = [
  0x262422, // Worn Charcoal Canvas
  0x2c3642, // Faded Indigo Denim
  0x4a392c, // Weathered Trail Brown
  0x6e5d49, // Dusty Frontier Khaki
  0x3b3d32, // Muted Sage Canvas
  0x362a24, // Raw Umber Wool
];

export const WESTERN_LEATHER_PALETTE = [
  0x5a3b22, // Saddle Brown Leather
  0x2b221c, // Dark Espresso Leather
  0x7a5634, // Rawhide Tan Leather
  0x22201e, // Worn Black Leather
  0x6e3d24, // Burnt Chestnut Leather
  0x4d2d1d, // Aged Mahogany Leather
];

export const WESTERN_HAT_PALETTE = [
  0x5a3b22, // Weathered Saddle Leather
  0x2b241f, // Dark Espresso Felt
  0x8a6d4b, // Dusty Frontier Tan
  0x3b3734, // Worn Charcoal Felt
  0x6e472b, // Sun-baked Chestnut
  0x9e8869, // Sun-bleached Straw/Suede
];

const pickRandom = <T>(arr: readonly T[]): T => arr[Math.floor(Math.random() * arr.length)]!;

export const NPC_ASSET_COUNTS = {
  characters: 3,
  hats: 1,
  holsters: 2,
} as const;

const pad3 = (n: number) => String(n).padStart(3, "0");

export const NPC_MODELS: readonly string[] = Array.from(
  { length: NPC_ASSET_COUNTS.characters },
  (_, i) => `/models/npc/characters/npc_${pad3(i + 1)}.glb`
);

export const MODULAR_HATS: readonly string[] = Array.from(
  { length: NPC_ASSET_COUNTS.hats },
  (_, i) => `/models/npc/modular/accessories/hat/hat_${pad3(i + 1)}.glb`
);

export const MODULAR_HOLSTERS: readonly string[] = Array.from(
  { length: NPC_ASSET_COUNTS.holsters },
  (_, i) => `/models/npc/modular/accessories/holster/holster_${pad3(i + 1)}.glb`
);

export function getNPCModelByIndex(index: number): string {
  return NPC_MODELS[Math.abs(index) % NPC_MODELS.length]!;
}

export function getRandomHatUrl(): string {
  return MODULAR_HATS[Math.floor(Math.random() * MODULAR_HATS.length)]!;
}

const gltfCache = new Map<string, Promise<GLTF>>();

function loadCachedGLTF(url: string, loader: GLTFLoader): Promise<GLTF> {
  let promise = gltfCache.get(url);
  if (!promise) {
    promise = loader.loadAsync(url).catch((err) => {
      gltfCache.delete(url);
      throw err;
    });
    gltfCache.set(url, promise);
  }
  return promise;
}

export function getRandomModularConfig(): Required<ModularPartsConfig> {
  const modelUrl = pickRandom(NPC_MODELS);
  const outfitColor = pickRandom(WESTERN_OUTFIT_PALETTE);
  const pantsColor = pickRandom(WESTERN_PANTS_PALETTE);
  const bootsColor = pickRandom(WESTERN_LEATHER_PALETTE);
  const hatColor = pickRandom(WESTERN_HAT_PALETTE);
  const holsterColor = pickRandom(WESTERN_LEATHER_PALETTE);
  const wearsHat = Math.random() < 0.70;
  const accessoryUrl = wearsHat ? getRandomHatUrl() : "";
  const wearsHolster = Math.random() < 0.80;
  const holsterUrl = wearsHolster ? pickRandom(MODULAR_HOLSTERS) : "";

  return {
    modelUrl,
    accessoryUrl,
    holsterUrl,
    outfitColor,
    pantsColor,
    bootsColor,
    hatColor,
    holsterColor,
  };
}

export interface ModularModelOptions {
  position?: [number, number, number] | THREE.Vector3;
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Assembles a complete, high-quality Western NPC (Arthur Morgan) with optional
 * socket accessories (cowboy hat, holster) and dynamic outfit color tinting.
 */
export async function assembleModularCharacter(
  config: ModularPartsConfig = {},
  options: ModularModelOptions = {},
  parentScene?: THREE.Object3D,
  loader = new GLTFLoader()
): Promise<ModelObject> {
  const modelUrl = config.modelUrl || NPC_MODELS[0]!;

  const baseGltf = await loadCachedGLTF(modelUrl, loader);
  // SAFETY: Three.js SkeletonUtils.clone preserves skinning and hierarchy
  const root = SkeletonUtils.clone(baseGltf.scene) as THREE.Group;

  // Purge any stray static / icosphere geometry
  const toRemove: THREE.Object3D[] = [];
  root.traverse((c) => {
    if (c.name.toLowerCase().includes("icosphere")) {
      toRemove.push(c);
    }
  });
  for (const c of toRemove) {
    if (c.parent) c.parent.remove(c);
  }

  let skeleton: THREE.Skeleton | null = null;
  let baseArmature: THREE.Object3D | null = null;

  root.traverse((child) => {
    // SAFETY: Type assertion verified by Three.js isSkinnedMesh property check
    if ((child as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
      skeleton = (child as THREE.SkinnedMesh).skeleton;
    }
    if (child.type === "Bone" && !baseArmature && child.parent?.type !== "Bone") {
      baseArmature = child.parent || child;
    }
  });

  if (!skeleton) {
    throw new Error(`Model (${modelUrl}) missing skeleton!`);
  }

  // Attach socket accessory (cached GLTF + optional Western color tint)
  const attachSocketProp = async (url: string, boneName: string, tintColor?: number | THREE.Color) => {
    if (!url || !skeleton) return;
    try {
      const propGltf = await loadCachedGLTF(url, loader);
      const cloned = SkeletonUtils.clone(propGltf.scene);

      cloned.traverse((child) => {
        const isIcosphere = child.name.toLowerCase().includes("icosphere");
        if (isIcosphere) return;

        if (tintColor !== undefined && (child as THREE.Mesh).isMesh) {
          const mesh = child as THREE.Mesh;
          const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
          const tinted = mats.map((m) => {
            if (!m) return m;
            const cm = (m as THREE.MeshStandardMaterial).clone();
            cm.color.lerp(new THREE.Color(tintColor), 0.45);
            cm.roughness = Math.max(cm.roughness ?? 0.8, 0.82);
            return cm;
          });
          mesh.material = Array.isArray(mesh.material) ? tinted : (tinted[0] ?? mesh.material);
        }

        // SAFETY: Type assertion verified by Three.js isSkinnedMesh check
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          const sm = child as THREE.SkinnedMesh;
          sm.bind(skeleton!, sm.bindMatrix);
          (baseArmature || root).add(sm);
        } else if ((child as THREE.Mesh).isMesh) {
          const targetBone = skeleton?.getBoneByName(boneName);
          if (targetBone) targetBone.add(child);
          else root.add(child);
        }
      });
    } catch (err) {
      console.warn(`[ModularNPC] Failed to attach prop from ${url}:`, err);
    }
  };

  if (config.accessoryUrl) {
    await attachSocketProp(config.accessoryUrl, "Head_08", config.hatColor);
  }
  if (config.holsterUrl) {
    await attachSocketProp(config.holsterUrl, "Hips_01", config.holsterColor);
  }

  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const meshName = mesh.name.toLowerCase();

      const isFaceMesh =
        meshName.includes("head") ||
        meshName.includes("avatarhead") ||
        meshName.includes("mesh_") ||
        meshName.includes("cornea") ||
        meshName.includes("eyeball") ||
        meshName.includes("teeth") ||
        meshName.includes("eyelash");

      if (isFaceMesh) {
        // Face/Head: disable receiveShadow so hat brim never casts pitch-black shadow over eyes & face
        mesh.receiveShadow = false;
        mesh.castShadow = true;
      } else {
        mesh.castShadow = options.castShadow ?? true;
        mesh.receiveShadow = options.receiveShadow ?? true;
      }

      if (config.outfitColor !== undefined) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const newMats: THREE.Material[] = [];
        for (const mat of mats) {
          if (mat) {
            const mName = mat.name.toLowerCase();
            const isShirt = mName.includes("shirt");
            const isSuit = mName.includes("outfit") || mName.includes("suit");
            if (isShirt || isSuit) {
              const clonedMat = (mat as THREE.MeshStandardMaterial).clone();
              clonedMat.color.set(config.outfitColor);
              clonedMat.roughness = 0.84;
              clonedMat.metalness = 0.05;

              clonedMat.onBeforeCompile = (shader) => {
                if (isShirt) {
                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <map_fragment>",
                    `
                    #ifdef USE_MAP
                      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
                      float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                      float foldIntensity = clamp(lum / 0.44, 0.35, 1.35);
                      diffuseColor.rgb = diffuseColor.rgb * foldIntensity;
                    #endif
                    `
                  );
                } else if (isSuit) {
                  shader.fragmentShader = shader.fragmentShader.replace(
                    "#include <map_fragment>",
                    `
                    #ifdef USE_MAP
                      vec4 sampledDiffuseColor = texture2D( map, vMapUv );
                      float lum = dot(sampledDiffuseColor.rgb, vec3(0.299, 0.587, 0.114));
                      if (lum > 0.6) {
                        diffuseColor.rgb = vec3(0.92);
                      } else {
                        float suitFolds = clamp(lum / 0.08, 0.35, 1.5);
                        diffuseColor.rgb = diffuseColor.rgb * suitFolds;
                      }
                    #endif
                    `
                  );
                }
              };
              clonedMat.customProgramCacheKey = () => (isShirt ? "tinted_shirt_v2" : "tinted_suit_v2");
              newMats.push(clonedMat);
            } else if (mName.includes("pants") && config.pantsColor !== undefined) {
              const clonedMat = (mat as THREE.MeshStandardMaterial).clone();
              clonedMat.color.lerp(new THREE.Color(config.pantsColor), 0.65);
              clonedMat.roughness = 0.86;
              clonedMat.metalness = 0.04;
              newMats.push(clonedMat);
            } else if ((mName.includes("boot") || mName.includes("shoes")) && config.bootsColor !== undefined) {
              const clonedMat = (mat as THREE.MeshStandardMaterial).clone();
              clonedMat.color.lerp(new THREE.Color(config.bootsColor), 0.55);
              clonedMat.roughness = 0.78;
              clonedMat.metalness = 0.08;
              newMats.push(clonedMat);
            } else if (mName.includes("suspender") && config.holsterColor !== undefined) {
              const clonedMat = (mat as THREE.MeshStandardMaterial).clone();
              clonedMat.color.lerp(new THREE.Color(config.holsterColor), 0.55);
              clonedMat.roughness = 0.82;
              newMats.push(clonedMat);
            } else {
              newMats.push(mat);
            }
          }
        }
        mesh.material = Array.isArray(mesh.material) ? newMats : (newMats[0] ?? mesh.material);
      }

      const currentMats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of currentMats) {
        if (mat) {
          const stdMat = mat as THREE.MeshStandardMaterial;

          if (isFaceMesh) {
            // Human skin/eyes/beard are non-metallic dielectric
            stdMat.metalness = 0.0;
            stdMat.roughness = Math.min(0.78, Math.max(0.55, stdMat.roughness));
            // Subtle warm ambient emissive fill: ensures eyes, facial features, and contours
            // are never crushed into pitch-black silhouette, while still responding naturally to sunlight
            stdMat.emissive.set(0x382c22);
            stdMat.emissiveIntensity = 0.32;
          }

          if (stdMat.map) {
            stdMat.map.colorSpace = THREE.SRGBColorSpace;
          }

          materials.push(stdMat);
        }
      }
    }
  });

  if (options.position) {
    if (Array.isArray(options.position)) root.position.set(...options.position);
    else root.position.copy(options.position);
  }
  if (options.scale !== undefined) {
    root.scale.setScalar(options.scale);
  }

  if (parentScene) {
    parentScene.add(root);
  }

  const mixer = new THREE.AnimationMixer(root);
  const animations = new Map<string, THREE.AnimationClip>();
  if (baseGltf.animations) {
    for (const clip of baseGltf.animations) {
      clip.tracks = clip.tracks.filter((t: THREE.KeyframeTrack) => {
        const lower = t.name.toLowerCase();
        return (
          !lower.includes("thumb") &&
          !lower.includes("index") &&
          !lower.includes("middle") &&
          !lower.includes("ring") &&
          !lower.includes("pinky") &&
          !lower.includes("forearm1") &&
          !lower.includes("forearm2")
        );
      });
      animations.set(clip.name, clip);
      const lower = clip.name.toLowerCase();
      if (lower.startsWith("idle") && !animations.has("Idle")) {
        animations.set("Idle", clip);
      } else if (lower.startsWith("wave") && !animations.has("Wave")) {
        animations.set("Wave", clip);
      }
    }
  }
  const boundingBox = new THREE.Box3().setFromObject(root);

  const modelObj: ModelObject = {
    id: `modular_npc_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    name: "ModularNPC",
    root,
    boundingBox,
    materials,
    animations,
    mixer,
    setPosition(x: number, y: number, z: number) {
      root.position.set(x, y, z);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    setRotation(x: number, y: number, z: number) {
      root.rotation.set(x, y, z);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    setQuaternion(x: number, y: number, z: number, w: number) {
      root.quaternion.set(x, y, z, w);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    setScale(s: number | [number, number, number]) {
      if (typeof s === "number") root.scale.setScalar(s);
      else root.scale.set(...s);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    setShadows(cast?: boolean, receive?: boolean) {
      root.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          if (cast !== undefined) c.castShadow = cast;
          if (receive !== undefined) c.receiveShadow = receive;
        }
      });
      return modelObj;
    },
    setEmissive(color: number | THREE.Color, intensity?: number) {
      const c = typeof color === "number" ? new THREE.Color(color) : color;
      for (const m of materials) {
        m.emissive.copy(c);
        if (intensity !== undefined) m.emissiveIntensity = intensity;
      }
      return modelObj;
    },
    setRoughness(roughness: number) {
      for (const m of materials) m.roughness = roughness;
      return modelObj;
    },
    setMetalness(metalness: number) {
      for (const m of materials) m.metalness = metalness;
      return modelObj;
    },
    setOpacity(opacity: number) {
      for (const m of materials) {
        m.transparent = opacity < 1;
        m.opacity = opacity;
      }
      return modelObj;
    },
    addTo(scene: THREE.Object3D) {
      scene.add(root);
      return modelObj;
    },
    remove() {
      if (root.parent) root.parent.remove(root);
      return modelObj;
    },
    update(dt: number) {
      mixer.update(dt);
    },
    getChild(name: string) {
      return root.getObjectByName(name) || null;
    },
    getMesh(name: string) {
      const obj = root.getObjectByName(name);
      return (obj && (obj as THREE.Mesh).isMesh) ? (obj as THREE.Mesh) : null;
    },
    getCenter(target = new THREE.Vector3()) {
      boundingBox.setFromObject(root);
      return boundingBox.getCenter(target);
    },
    getSize(target = new THREE.Vector3()) {
      boundingBox.setFromObject(root);
      return boundingBox.getSize(target);
    },
    playAnimation(name = "Walk", loop = true) {
      let clip = animations.get(name);
      if (!clip && animations.size > 0) {
        clip = animations.values().next().value;
      }
      if (!clip) return null;
      const action = mixer.clipAction(clip);
      action.setLoop(loop ? THREE.LoopRepeat : THREE.LoopOnce, loop ? Infinity : 1);
      action.clampWhenFinished = !loop;
      action.reset().play();
      return action;
    },
    stopAnimations() {
      mixer.stopAllAction();
      return modelObj;
    },
    clone(_newId?: string) {
      return modelObj;
    },
    destroy() {
      modelObj.remove();
      mixer.stopAllAction();
      root.traverse((c) => {
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else if (m.material) m.material.dispose();
        }
      });
    },
  };

  return modelObj;
}

export interface NodeInspectionRecord {
  name: string;
  type: string;
  isSkinnedMesh: boolean;
  bonesCount: number;
  materials: string;
  hasTexture: boolean;
  visible: boolean;
  vertsCount: number;
}

/**
 * Diagnostic helper: logs complete node hierarchy, skeleton binding, and materials of an NPC.
 */
export function inspectNPC(target: THREE.Object3D | ModelObject): NodeInspectionRecord[] {
  const root = (target as ModelObject).root ?? (target as THREE.Object3D);
  const records: NodeInspectionRecord[] = [];

  root.traverse((child) => {
    const isMesh = (child as THREE.Mesh).isMesh;
    const isSkinned = (child as THREE.SkinnedMesh).isSkinnedMesh;
    const sm = child as THREE.SkinnedMesh;
    const m = child as THREE.Mesh;

    let matNames = "none";
    let hasMap = false;
    if (isMesh && m.material) {
      const mats = Array.isArray(m.material) ? m.material : [m.material];
      matNames = mats.map((mt) => mt.name || "unnamed").join(", ");
      hasMap = mats.some((mt) => !!(mt as THREE.MeshStandardMaterial).map);
    }

    records.push({
      name: child.name || "(anonymous)",
      type: child.type,
      isSkinnedMesh: !!isSkinned,
      bonesCount: isSkinned && sm.skeleton ? sm.skeleton.bones.length : 0,
      materials: matNames,
      hasTexture: hasMap,
      visible: child.visible,
      vertsCount: isMesh && m.geometry ? (m.geometry.attributes["position"]?.count ?? 0) : 0,
    });
  });

  console.table(records);
  return records;
}
