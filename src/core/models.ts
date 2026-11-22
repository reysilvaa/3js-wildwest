import * as THREE from "three";
import { GLTFLoader, GLTF } from "three/addons/loaders/GLTFLoader.js";
import * as SkeletonUtils from "three/addons/utils/SkeletonUtils.js";
import { ASSET_MAP, AssetKey } from "../environment/assets.js";

export interface ModelOptions {
  position?: [number, number, number] | THREE.Vector3;
  rotation?: [number, number, number] | THREE.Euler | [number, number, number, number] | THREE.Quaternion;
  scale?: number | [number, number, number] | THREE.Vector3;
  castShadow?: boolean;
  receiveShadow?: boolean;
  autoAdd?: boolean;
  onUpdate?: (model: ModelObject, dt: number) => void;
}

export interface ModelObject {
  readonly id: string;
  readonly name: string;
  readonly root: THREE.Group;
  readonly boundingBox: THREE.Box3;
  readonly materials: THREE.MeshStandardMaterial[];
  readonly animations: Map<string, THREE.AnimationClip>;
  readonly mixer: THREE.AnimationMixer | null;

  // Transform controls
  setPosition(x: number, y: number, z: number): ModelObject;
  setRotation(x: number, y: number, z: number): ModelObject;
  setQuaternion(x: number, y: number, z: number, w: number): ModelObject;
  setScale(s: number | [number, number, number]): ModelObject;

  // Material & visual styling
  setEmissive(color: number | THREE.Color, intensity: number): ModelObject;
  setRoughness(roughness: number): ModelObject;
  setMetalness(metalness: number): ModelObject;
  setOpacity(opacity: number): ModelObject;
  setShadows(cast: boolean, receive: boolean): ModelObject;

  // Hierarchy & Queries
  getChild(name: string): THREE.Object3D | null;
  getMesh(name: string): THREE.Mesh | null;
  getCenter(target?: THREE.Vector3): THREE.Vector3;
  getSize(target?: THREE.Vector3): THREE.Vector3;

  // Animation controls
  playAnimation(name?: string, loop?: boolean): THREE.AnimationAction | null;
  stopAnimations(): ModelObject;

  // Lifecycle
  addTo(parent: THREE.Object3D): ModelObject;
  remove(): ModelObject;
  update(dt: number): void;
  clone(newId?: string): ModelObject;
  destroy(): void;
}

export interface ModelSystemOptions {
  scene?: THREE.Scene;
  defaultCastShadow?: boolean;
  defaultReceiveShadow?: boolean;
}

export interface ModelSystem {
  load(keyOrUrl: AssetKey | string, options?: ModelOptions): Promise<ModelObject>;
  create(keyOrUrl: AssetKey | string, options?: ModelOptions): Promise<ModelObject>;
  update(dt: number): void;
  get(id: string): ModelObject | undefined;
  getAll(): ModelObject[];
  remove(idOrObj: string | ModelObject): boolean;
  clear(): void;
}

const gltfLoader = new GLTFLoader();
const rawGltfCache = new Map<string, GLTF>();
let instanceCounter = 0;

function resolveUrl(keyOrUrl: AssetKey | string): string {
  if (keyOrUrl in ASSET_MAP) {
    return ASSET_MAP[keyOrUrl as AssetKey];
  }
  return keyOrUrl;
}

export function loadGltfCached(url: string): Promise<GLTF> {
  const cached = rawGltfCache.get(url);
  if (cached) return Promise.resolve(cached);

  return new Promise((resolve, reject) => {
    gltfLoader.load(
      url,
      (gltf) => {
        rawGltfCache.set(url, gltf);
        resolve(gltf);
      },
      undefined,
      (err) => reject(err)
    );
  });
}

/**
 * Creates an autonomous, high-level ModelObject instance from raw glTF
 */
export async function createModelObject(
  keyOrUrl: AssetKey | string,
  options: ModelOptions = {},
  parentScene?: THREE.Object3D
): Promise<ModelObject> {
  const url = resolveUrl(keyOrUrl);
  const gltf = await loadGltfCached(url);

  instanceCounter++;
  const id = `model_${keyOrUrl}_${instanceCounter}`;
  // Use SkeletonUtils to correctly clone SkinnedMesh skeletons and bone bindings
  const root = (SkeletonUtils.clone(gltf.scene) as THREE.Group);
  root.name = id;

  const materials: THREE.MeshStandardMaterial[] = [];
  const castShadow = options.castShadow ?? true;
  const receiveShadow = options.receiveShadow ?? true;

  root.traverse((child) => {
    // SAFETY: Type assertion verified by Three.js isMesh property check
    if ((child as THREE.Mesh).isMesh) {
      const mesh = child as THREE.Mesh;
      mesh.castShadow = castShadow;
      mesh.receiveShadow = receiveShadow;
      mesh.frustumCulled = true;

      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      for (const m of mats) {
        if (m && (m as THREE.MeshStandardMaterial).isMeshStandardMaterial) {
          const stdMat = m as THREE.MeshStandardMaterial;
          stdMat.needsUpdate = true;
          if (keyOrUrl.includes("jokowi")) {
            if (stdMat.emissive) {
              stdMat.emissive.set(0x000000);
              stdMat.emissiveIntensity = 0;
            }
          }
          if (!materials.includes(stdMat)) {
            materials.push(stdMat);
          }
        }
      }
    }
  });

  // Setup Animations
  const animations = new Map<string, THREE.AnimationClip>();
  let mixer: THREE.AnimationMixer | null = null;
  if (gltf.animations && gltf.animations.length > 0) {
    mixer = new THREE.AnimationMixer(root);
    for (const clip of gltf.animations) {
      animations.set(clip.name, clip);
    }
  }

  // Initial Transform
  if (options.position) {
    if (Array.isArray(options.position)) root.position.set(...options.position);
    else root.position.copy(options.position);
  }
  if (options.rotation) {
    if (Array.isArray(options.rotation)) {
      if (options.rotation.length === 4) {
        root.quaternion.set(options.rotation[0], options.rotation[1], options.rotation[2], options.rotation[3]);
      } else {
        root.rotation.set(options.rotation[0], options.rotation[1], options.rotation[2]);
      }
    } else if (options.rotation instanceof THREE.Euler) {
      root.rotation.copy(options.rotation);
    } else if (options.rotation instanceof THREE.Quaternion) {
      root.quaternion.copy(options.rotation);
    }
  }
  if (options.scale !== undefined) {
    if (typeof options.scale === "number") root.scale.setScalar(options.scale);
    else if (Array.isArray(options.scale)) root.scale.set(...options.scale);
    else root.scale.copy(options.scale);
  }

  const boundingBox = new THREE.Box3().setFromObject(root);

  const modelObj: ModelObject = {
    id,
    name: String(keyOrUrl),
    root,
    boundingBox,
    materials,
    animations,
    mixer,

    setPosition(x, y, z) {
      root.position.set(x, y, z);
      boundingBox.setFromObject(root);
      return modelObj;
    },

    setRotation(x, y, z) {
      root.rotation.set(x, y, z);
      boundingBox.setFromObject(root);
      return modelObj;
    },

    setQuaternion(x, y, z, w) {
      root.quaternion.set(x, y, z, w);
      boundingBox.setFromObject(root);
      return modelObj;
    },

    setScale(s) {
      if (typeof s === "number") root.scale.setScalar(s);
      else root.scale.set(...s);
      boundingBox.setFromObject(root);
      return modelObj;
    },

    setEmissive(color, intensity) {
      const c = typeof color === "number" ? new THREE.Color(color) : color;
      for (const m of materials) {
        m.emissive.copy(c);
        m.emissiveIntensity = intensity;
      }
      return modelObj;
    },

    setRoughness(roughness) {
      for (const m of materials) m.roughness = roughness;
      return modelObj;
    },

    setMetalness(metalness) {
      for (const m of materials) m.metalness = metalness;
      return modelObj;
    },

    setOpacity(opacity) {
      for (const m of materials) {
        m.transparent = opacity < 1;
        m.opacity = opacity;
      }
      return modelObj;
    },

    setShadows(cast, receive) {
      root.traverse((c) => {
        // SAFETY: Type assertion verified by Three.js isMesh check
        if ((c as THREE.Mesh).isMesh) {
          c.castShadow = cast;
          c.receiveShadow = receive;
        }
      });
      return modelObj;
    },

    getChild(name) {
      return root.getObjectByName(name) || null;
    },

    getMesh(name) {
      const obj = root.getObjectByName(name);
      // SAFETY: Type assertion verified by isMesh check
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

    playAnimation(clipName, loop = true) {
      if (!mixer || animations.size === 0) return null;
      let clip: THREE.AnimationClip | undefined;
      if (clipName) {
        clip = animations.get(clipName);
        if (!clip) {
          // Case-insensitive lookup
          for (const [k, v] of animations.entries()) {
            if (k.toLowerCase() === clipName.toLowerCase()) {
              clip = v;
              break;
            }
          }
        }
      } else {
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
      if (mixer) mixer.stopAllAction();
      return modelObj;
    },

    addTo(parent) {
      parent.add(root);
      boundingBox.setFromObject(root);
      return modelObj;
    },

    remove() {
      if (root.parent) root.parent.remove(root);
      return modelObj;
    },

    update(dt) {
      if (mixer) mixer.update(dt);
      options.onUpdate?.(modelObj, dt);
    },

    clone(newId) {
      const cloned = createSyncClone(modelObj, newId);
      return cloned;
    },

    destroy() {
      modelObj.remove();
      if (mixer) mixer.stopAllAction();
      root.traverse((c) => {
        // SAFETY: Type assertion verified by Three.js isMesh check
        if ((c as THREE.Mesh).isMesh) {
          const m = c as THREE.Mesh;
          if (m.geometry) m.geometry.dispose();
          if (Array.isArray(m.material)) m.material.forEach((mat) => mat.dispose());
          else if (m.material) m.material.dispose();
        }
      });
    },
  };

  if (options.autoAdd !== false && parentScene) {
    modelObj.addTo(parentScene);
  }

  return modelObj;
}

function createSyncClone(original: ModelObject, newId?: string): ModelObject {
  instanceCounter++;
  const id = newId || `${original.name}_clone_${instanceCounter}`;
  const root = original.root.clone(true);
  root.name = id;

  const materials: THREE.MeshStandardMaterial[] = [];
  root.traverse((c) => {
    // SAFETY: Type assertion verified by Three.js isMesh check
    if ((c as THREE.Mesh).isMesh) {
      const m = c as THREE.Mesh;
      if (m.material) {
        const std = (m.material as THREE.MeshStandardMaterial).clone();
        m.material = std;
        materials.push(std);
      }
    }
  });

  let mixer: THREE.AnimationMixer | null = null;
  if (original.animations.size > 0) {
    mixer = new THREE.AnimationMixer(root);
  }

  const boundingBox = new THREE.Box3().setFromObject(root);

  const cloneObj: ModelObject = {
    ...original,
    id,
    root,
    boundingBox,
    materials,
    mixer,
    addTo(p) { p.add(root); return cloneObj; },
    remove() { if (root.parent) root.parent.remove(root); return cloneObj; },
    update(dt) { if (mixer) mixer.update(dt); },
  };

  return cloneObj;
}

/**
 * Initializes a central Model Manager System (mirrors initAudio & initScene)
 */
export function initModels(scene?: THREE.Scene, sysOptions: ModelSystemOptions = {}): ModelSystem {
  const activeScene = scene || sysOptions.scene;
  const registry = new Map<string, ModelObject>();

  async function load(keyOrUrl: AssetKey | string, options: ModelOptions = {}): Promise<ModelObject> {
    const obj = await createModelObject(keyOrUrl, options, activeScene);
    registry.set(obj.id, obj);
    return obj;
  }

  function update(dt: number): void {
    for (const obj of registry.values()) {
      obj.update(dt);
    }
  }

  function get(id: string): ModelObject | undefined {
    return registry.get(id);
  }

  function getAll(): ModelObject[] {
    return Array.from(registry.values());
  }

  function remove(idOrObj: string | ModelObject): boolean {
    const id = typeof idOrObj === "string" ? idOrObj : idOrObj.id;
    const obj = registry.get(id);
    if (obj) {
      obj.destroy();
      return registry.delete(id);
    }
    return false;
  }

  function clear(): void {
    for (const obj of registry.values()) {
      obj.destroy();
    }
    registry.clear();
  }

  return {
    load,
    create: load,
    update,
    get,
    getAll,
    remove,
    clear,
  };
}
