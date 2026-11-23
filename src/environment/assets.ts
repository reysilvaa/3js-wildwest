import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";

export interface ModelsManifest {
  buildings: Record<string, string>;
  structures: Record<string, string>;
  props: Record<string, string>;
  environment: Record<string, string>;
  animations: Record<string, string>;
  npc: {
    characters: string[];
    hats: string[];
    holsters: string[];
  };
}

export type AssetKey = string;

const sharedLoader = new GLTFLoader();
const gltfCache = new Map<string, Promise<GLTF>>();
const assetCache = new Map<AssetKey, THREE.Group>();
let manifestPromise: Promise<ModelsManifest> | null = null;
let flatLookupPromise: Promise<Map<string, string>> | null = null;

/**
 * Loads and caches /models/manifest.json (Single Source of Truth for all 3D models).
 */
export function getModelsManifest(): Promise<ModelsManifest> {
  if (!manifestPromise) {
    manifestPromise = fetch("/models/manifest.json")
      .then((res) => {
        if (!res.ok) throw new Error(`Failed to load /models/manifest.json (${res.status})`);
        return res.json() as Promise<ModelsManifest>;
      })
      .catch((err) => {
        manifestPromise = null;
        throw err;
      });
  }
  return manifestPromise;
}

function getFlatAssetLookup(): Promise<Map<string, string>> {
  if (!flatLookupPromise) {
    flatLookupPromise = getModelsManifest().then((m) => {
      const map = new Map<string, string>();
      for (const group of [m.buildings, m.structures, m.props, m.environment, m.animations]) {
        for (const [key, url] of Object.entries(group)) {
          map.set(key, url);
        }
      }
      return map;
    });
  }
  return flatLookupPromise;
}

export async function resolveAssetUrl(keyOrUrl: AssetKey): Promise<string> {
  if (keyOrUrl.startsWith("/") || keyOrUrl.startsWith("http")) return keyOrUrl;
  const resolved = (await getFlatAssetLookup()).get(keyOrUrl);
  if (!resolved) {
    throw new Error(`[assets] Unknown asset key "${keyOrUrl}" not found in /models/manifest.json`);
  }
  return resolved;
}

/**
 * Shared cached GLTF loader across the entire app (1 GLTFLoader, 1 network fetch per URL).
 */
export function loadGLTF(url: string): Promise<GLTF> {
  let promise = gltfCache.get(url);
  if (!promise) {
    promise = sharedLoader.loadAsync(url).catch((err) => {
      gltfCache.delete(url);
      throw err;
    });
    gltfCache.set(url, promise);
  }
  return promise;
}

/**
 * Loads and caches a static model asset by its manifest key.
 */
export async function loadAsset(name: AssetKey): Promise<THREE.Group> {
  const cached = assetCache.get(name);
  if (cached) return cached.clone(true);

  const gltf = await loadGLTF(await resolveAssetUrl(name));
  const root = gltf.scene;
  root.traverse((child) => {
    // SAFETY: Type assertion verified by Three.js isMesh property check
    if ((child as THREE.Mesh).isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });
  assetCache.set(name, root);
  return root.clone(true);
}


