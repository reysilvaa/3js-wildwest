import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { ModelObject } from "../../core/models.js";

export interface ModularPartsConfig {
  headUrl?: string;
  hairUrl?: string;
  bodyUrl?: string;
  outfitUrl?: string;
  accessoryUrl?: string;  // Topi (Hat)
  bandanaUrl?: string;    // Syal (Bandana)
  holsterUrl?: string;    // Sabuk & Pistol (Gun Holster)
  bootsUrl?: string;      // Sepatu Boots (Boots & Spurs)
  outfitColor?: number | THREE.Color;
}

export const FRONTIER_HEADS = [
  { id: "arthur", name: "Arthur Morgan", headUrl: "/models/npc/modular/heads/arthur_head.glb", hasHat: false },
  { id: "cowboy", name: "Dusty Cowboy", headUrl: "/models/npc/modular/heads/cowboy_head.glb", hasHat: true },
  { id: "outlaw", name: "Rugged Outlaw", headUrl: "/models/npc/modular/heads/outlaw_head.glb", hasHat: true },
] as const;

export const NPC_ARCHETYPES = [
  {
    id: "frontier",
    name: "Frontier Townsfolk",
    outfitUrl: "/models/npc/modular/outfits/outfit_arthur.glb",
    allowedColors: [
      0x22354c, // Deep Navy Blue (Classic Arthur)
      0x784a22, // Saddle Brown Leather
      0xb89562, // Dusty Tan Buckskin
      0x1f1f1f, // Charcoal Black (Gunslinger)
      0x5c1d24, // Wine / Burgundy (Gambler)
      0x384732, // Forest Olive (Scout)
    ],
  },
  {
    id: "suit",
    name: "Town Gentleman / Banker",
    outfitUrl: "/models/npc/modular/outfits/outfit_suit.glb",
    headUrl: "/models/npc/modular/heads/head_default.glb",
    allowedColors: [
      0x1a1a1a, // Pitch Black (Undertaker / Mayor)
      0x252a34, // Midnight Navy (Banker)
      0x3d3835, // Charcoal Tweed (Doctor)
      0x4a3728, // Dark Brown Wool (Merchant)
    ],
  },
] as const;

export const MODULAR_HEADS = [
  { id: "arthur", name: "Arthur Morgan", headUrl: "/models/npc/modular/heads/arthur_head.glb" },
  { id: "cowboy", name: "Dusty Cowboy", headUrl: "/models/npc/modular/heads/cowboy_head.glb" },
  { id: "outlaw", name: "Rugged Outlaw", headUrl: "/models/npc/modular/heads/outlaw_head.glb" },
  { id: "jokowi", name: "Jokowi", headUrl: "/models/npc/modular/heads/head_default.glb" },
] as const;

export const MODULAR_OUTFITS = [
  { id: "arthur", name: "Arthur Frontier", outfitUrl: "/models/npc/modular/outfits/outfit_arthur.glb" },
  { id: "suit",   name: "Frontier Suit",   outfitUrl: "/models/npc/modular/outfits/outfit_suit.glb" },
] as const;

export const WESTERN_OUTFIT_PALETTE = [
  0x1f1f1f, // Charcoal Black (Undertaker / Gentleman)
  0x784a22, // Saddle Brown Leather (Rancher)
  0xb89562, // Dusty Tan / Buckskin (Frontier Scout)
  0x22354c, // Deep Navy Blue (Town Marshal / Banker)
  0x5c1d24, // Wine / Burgundy (Saloon Gambler)
  0x384732, // Forest Olive (Mountain Scout)
  0x7a6b5c, // Weathered Dust Brown (Frontier Drifter)
];

const MODULAR_HATS = [
  "/models/npc/modular/accessories/arthur_hat.glb",
  "/models/npc/modular/accessories/cowboy_hat.glb",
];

const MODULAR_HOLSTERS = [
  "/models/npc/modular/accessories/arthur_holster.glb",
  "/models/npc/modular/accessories/gun_holster.glb",
];

export function getRandomModularConfig(): Required<ModularPartsConfig> {
  // 75% frontier townsfolk/cowboys/outlaws, 25% suit gentlemen/bankers
  const isFrontier = Math.random() < 0.75;
  const archetype = isFrontier ? NPC_ARCHETYPES[0]! : NPC_ARCHETYPES[1]!;
  
  // Pick head
  let headUrl: string;
  let hasIntegratedHat = false;
  if (isFrontier) {
    const picked = FRONTIER_HEADS[Math.floor(Math.random() * FRONTIER_HEADS.length)]!;
    headUrl = picked.headUrl;
    hasIntegratedHat = picked.hasHat;
  } else {
    headUrl = NPC_ARCHETYPES[1].headUrl;
  }

  // Pick procedural dye color from archetype palette
  const outfitColor = archetype.allowedColors[Math.floor(Math.random() * archetype.allowedColors.length)]!;

  // Hat: only attach if head does not already have a molded hat
  const wearsHat = Math.random() < 0.70;
  const pickedHat = MODULAR_HATS[Math.floor(Math.random() * MODULAR_HATS.length)]!;
  const accessoryUrl = (!hasIntegratedHat && wearsHat) ? pickedHat : "";

  // 80% chance of wearing Gun Holster & Pistol at hips
  const wearsHolster = Math.random() < 0.80;
  const pickedHolster = MODULAR_HOLSTERS[Math.floor(Math.random() * MODULAR_HOLSTERS.length)]!;
  const holsterUrl = wearsHolster ? pickedHolster : "";

  // Bandana overlay disabled: rigid neck scarves clip through beards and shirts
  const bandanaUrl = "";

  // Base outfits have built-in footwear. Keeping bootsUrl empty avoids duplicate overlapping footwear.
  const bootsUrl = "";

  return {
    headUrl,
    outfitUrl: archetype.outfitUrl,
    bodyUrl: "/models/npc/modular/bodies/body_hands.glb",
    hairUrl: "",
    accessoryUrl,
    bandanaUrl,
    holsterUrl,
    bootsUrl,
    outfitColor,
  };
}

export interface ModularModelOptions {
  position?: [number, number, number] | THREE.Vector3;
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Assembles a fully rigged humanoid NPC from modular parts (Head, Outfit, Hat, Bandana, Gun Holster, Boots)
 * all bound to the unified 79-bone skeleton.
 */
export async function assembleModularCharacter(
  config: ModularPartsConfig = {},
  options: ModularModelOptions = {},
  parentScene?: THREE.Object3D,
  loader = new GLTFLoader()
): Promise<ModelObject> {
  const outfitUrl = config.outfitUrl || "/models/npc/modular/outfits/outfit_suit.glb";
  const bodyUrl = config.bodyUrl || "/models/npc/modular/bodies/body_hands.glb";
  const headUrl = config.headUrl || "/models/npc/modular/heads/cowboy_head.glb";

  // 1. Base Outfit (Master Armature and Clothes)
  const outfitGltf = await loader.loadAsync(outfitUrl);
  const root = SkeletonUtils.clone(outfitGltf.scene) as THREE.Group;

  // Purge any stray static / icosphere geometry from outfit
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
    if ((child as THREE.SkinnedMesh).isSkinnedMesh && !skeleton) {
      skeleton = (child as THREE.SkinnedMesh).skeleton;
    }
    if (child.type === "Bone" && !baseArmature && child.parent?.type !== "Bone") {
      baseArmature = child.parent || child;
    }
  });

  if (!skeleton) {
    throw new Error(`Base modular outfit (${outfitUrl}) missing skeleton!`);
  }

  // Helper to rebind and attach SkinnedMeshes from any modular asset onto the master skeleton.
  //
  // KEY INSIGHT (from Blender MCP + raw GLB inspection):
  //   - All modular GLBs share IDENTICAL inverseBindMatrices (same 79-bone Jokowi_Armature).
  //   - Therefore m.bindMatrix from each part is valid and must be used — NOT identity.
  //   - We call cloned.updateWorldMatrix(true,true) first so m.bindMatrix reflects
  //     the actual world transform before we pass it to .bind().
  //   - Using identityMatrix would skip the bone rest-pose compensation → parts explode.
  const attachPartFromUrl = async (url: string, name: string) => {
    if (!url) return;
    try {
      const partGltf = await loader.loadAsync(url);
      const cloned = SkeletonUtils.clone(partGltf.scene);

      const meshes: THREE.SkinnedMesh[] = [];
      cloned.traverse((child) => {
        if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
          // Filter Icosphere (case-insensitive) — present in every GLB as placeholder
          const isIcosphere = child.name.toLowerCase().includes("icosphere");
          if (isIcosphere) return;

          const sm = child as THREE.SkinnedMesh;
          // Filter stray meshes with no valid bone weights (causes loose geometry at world origin)
          const skinWeight = sm.geometry.attributes["skinWeight"];
          let maxWeight = 0;
          if (skinWeight) {
            const arr = skinWeight.array;
            for (let i = 0; i < arr.length; i++) {
              const v = arr[i];
              if (v !== undefined && v > maxWeight) maxWeight = v;
            }
          }
          if (maxWeight > 0.001) {
            meshes.push(sm);
          }
        }
      });

      for (const m of meshes) {
        // Reset local transform so mesh sits at world origin matching the master skeleton rest pose.
        // All modular GLBs share identical inverse bind matrices (same 79-bone Jokowi_Armature,
        // verified: all IBM hashes match). Node transforms are identity in GLB (no TRS, no matrix).
        // Therefore bindMatrix must be identity — the mesh is at origin when bound.
        m.position.set(0, 0, 0);
        m.rotation.set(0, 0, 0);
        m.scale.set(1, 1, 1);
        // SAFETY: identity bindMatrix is correct — mesh node has no transform in GLB.
        m.bind(skeleton!, new THREE.Matrix4());
        (baseArmature || root).add(m);
      }
    } catch (err) {
      console.warn(`[ModularNPC] Failed to attach ${name} from ${url}:`, err);
    }
  };

  // 2. Attach Body Hands (outfit_arthur already includes its own modeled hands & arms)
  const hasHands = outfitUrl.includes("outfit_arthur");
  if (!hasHands) {
    await attachPartFromUrl(bodyUrl, "Hands");
  }

  // 3. Attach Head / Face
  await attachPartFromUrl(headUrl, "Head");

  // 4. Attach Accessories (Topi, Syal/Bandana, Sabuk/Pistol, Sepatu Boots)
  // Prevent duplicate hat & bandana if head already contains integrated accessories
  const hasHeadAccessories = headUrl.includes("cowboy_head") || headUrl.includes("outlaw_head");
  if (config.accessoryUrl && !hasHeadAccessories) {
    await attachPartFromUrl(config.accessoryUrl, "Hat");
  }
  if (config.bandanaUrl && !hasHeadAccessories) {
    await attachPartFromUrl(config.bandanaUrl, "Bandana");
  }
  if (config.holsterUrl) await attachPartFromUrl(config.holsterUrl, "GunHolster");
  if (config.bootsUrl) await attachPartFromUrl(config.bootsUrl, "Boots");

  // 5. Configure Shadows & Normalize PBR Face Lighting
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      const meshName = mesh.name.toLowerCase();

      // Check if mesh belongs to facial geometry or head
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

      // Tint base outfit mesh if requested (tint suits jackets, and tint Arthur's shirt)
      if (config.outfitColor !== undefined && meshName.includes("outfit")) {
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        const newMats: THREE.Material[] = [];
        for (const mat of mats) {
          if (mat) {
            const mName = mat.name.toLowerCase();
            const shouldTint = mName.includes("outfit") || mName.includes("shirt");
            if (shouldTint) {
              const clonedMat = (mat as THREE.MeshStandardMaterial).clone();
              clonedMat.color.set(config.outfitColor);
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

  // 6. Transform Configuration
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

  // 7. Animation Setup & ModelObject Contract
  const mixer = new THREE.AnimationMixer(root);
  const animations = new Map<string, THREE.AnimationClip>();
  if (outfitGltf.animations) {
    for (const clip of outfitGltf.animations) {
      animations.set(clip.name, clip);
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
