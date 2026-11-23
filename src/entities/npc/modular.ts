import * as THREE from "three";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { getModelsManifest, loadGLTF } from "../../environment/assets.js";

export interface NPCModel {
  readonly root: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly animations: Map<string, THREE.AnimationClip>;
  update: (dt: number) => void;
}

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

export async function getRandomHatUrl(): Promise<string> {
  const { npc } = await getModelsManifest();
  return npc.hats.length > 0 ? pickRandom(npc.hats) : "";
}

export async function getRandomModularConfig(modelIndex?: number): Promise<Required<ModularPartsConfig>> {
  const { npc } = await getModelsManifest();
  const modelUrl =
    modelIndex !== undefined && npc.characters.length > 0
      ? npc.characters[Math.abs(modelIndex) % npc.characters.length]!
      : pickRandom(npc.characters);
  const outfitColor = pickRandom(WESTERN_OUTFIT_PALETTE);
  const pantsColor = pickRandom(WESTERN_PANTS_PALETTE);
  const bootsColor = pickRandom(WESTERN_LEATHER_PALETTE);
  const hatColor = pickRandom(WESTERN_HAT_PALETTE);
  const holsterColor = pickRandom(WESTERN_LEATHER_PALETTE);
  const wearsHat = npc.hats.length > 0 && Math.random() < 0.70;
  const accessoryUrl = wearsHat ? pickRandom(npc.hats) : "";
  const wearsHolster = npc.holsters.length > 0 && Math.random() < 0.80;
  const holsterUrl = wearsHolster ? pickRandom(npc.holsters) : "";

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
  parentScene?: THREE.Object3D
): Promise<NPCModel> {
  const modelUrl = config.modelUrl || (await getModelsManifest()).npc.characters[0]!;

  const baseGltf = await loadGLTF(modelUrl);
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
      const propGltf = await loadGLTF(url);
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

  return {
    root,
    mixer,
    animations,
    update(dt: number) {
      mixer.update(dt);
    },
  };
}
