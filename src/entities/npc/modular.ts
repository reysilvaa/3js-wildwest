import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import type { ModelObject } from "../../core/models.js";

export interface ModularPartsConfig {
  headUrl?: string;
  hairUrl?: string;
  bodyUrl?: string;
  outfitUrl?: string;
}

export const MODULAR_HEADS = [
  { id: "cowboy", name: "Cowboy", headUrl: "/models/npc/modular/heads/cowboy_head.glb" },
  { id: "jokowi", name: "Jokowi", headUrl: "/models/npc/modular/heads/head_default.glb" },
] as const;

export const MODULAR_OUTFITS = [
  { id: "suit", name: "Formal Suit", outfitUrl: "/models/npc/modular/outfits/outfit_suit.glb" },
] as const;

export function getRandomModularConfig(): ModularPartsConfig {
  const head = MODULAR_HEADS[Math.floor(Math.random() * MODULAR_HEADS.length)]!;
  const outfit = MODULAR_OUTFITS[Math.floor(Math.random() * MODULAR_OUTFITS.length)]!;
  return {
    headUrl: head.headUrl,
    outfitUrl: outfit.outfitUrl,
    bodyUrl: "/models/npc/modular/bodies/body_hands.glb",
  };
}

export interface ModularModelOptions {
  position?: [number, number, number] | THREE.Vector3;
  scale?: number;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

/**
 * Assembles a fully rigged, autonomous humanoid character from modular parts
 * sharing the unified 79-bone armature (Jokowi_Armature).
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

  // 1. Base Outfit (Provides master Jokowi_Armature and main clothes SkinnedMesh)
  const outfitGltf = await loader.loadAsync(outfitUrl);
  const root = SkeletonUtils.clone(outfitGltf.scene) as THREE.Group;

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

  // 2. Attach Body Hands
  try {
    const bodyGltf = await loader.loadAsync(bodyUrl);
    const clonedBody = SkeletonUtils.clone(bodyGltf.scene);
    const bodyMeshes: THREE.SkinnedMesh[] = [];
    clonedBody.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        bodyMeshes.push(child as THREE.SkinnedMesh);
      }
    });
    for (const m of bodyMeshes) {
      m.bind(skeleton, m.bindMatrix);
      (baseArmature || root).add(m);
    }
  } catch (err) {
    console.warn("Failed to attach modular body hands:", err);
  }

  // 3. Attach Head & Hat
  try {
    const headGltf = await loader.loadAsync(headUrl);
    const clonedHead = SkeletonUtils.clone(headGltf.scene);
    const headMeshes: THREE.SkinnedMesh[] = [];
    clonedHead.traverse((child) => {
      if ((child as THREE.SkinnedMesh).isSkinnedMesh) {
        headMeshes.push(child as THREE.SkinnedMesh);
      }
    });
    for (const m of headMeshes) {
      m.bind(skeleton, m.bindMatrix);
      (baseArmature || root).add(m);
    }
  } catch (err) {
    console.warn(`Failed to attach modular head from ${headUrl}:`, err);
  }

  // 4. Configure Shadows & Collect Materials
  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((child) => {
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = options.castShadow ?? true;
      mesh.receiveShadow = options.receiveShadow ?? true;
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const mat of mats) {
        if (mat) materials.push(mat as THREE.MeshStandardMaterial);
      }
    }
  });

  // 5. Transform Configuration
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

  // 6. Animation Setup
  const mixer = new THREE.AnimationMixer(root);
  const animations = new Map<string, THREE.AnimationClip>();
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
    setScale(s: number | [number, number, number]) {
      if (typeof s === "number") root.scale.setScalar(s);
      else root.scale.set(...s);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    setQuaternion(x: number, y: number, z: number, w: number) {
      root.quaternion.set(x, y, z, w);
      boundingBox.setFromObject(root);
      return modelObj;
    },
    clone(_newId?: string) {
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
      return boundingBox.getCenter(target);
    },
    getSize(target = new THREE.Vector3()) {
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
