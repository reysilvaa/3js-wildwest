import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/addons/loaders/DRACOLoader.js";
import { readPersistentGLB, writePersistentGLB } from "@/core/asset-cache.js";
import { createLoadQueue } from "@/core/load-queue.js";

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

const dracoLoader = new DRACOLoader();
dracoLoader.setDecoderPath("/draco/");
const sharedLoader = new GLTFLoader();
sharedLoader.setDRACOLoader(dracoLoader);
const gltfQueue = createLoadQueue<GLTF>(5);
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

async function loadGLTFWithCache(url: string): Promise<GLTF> {
  if (import.meta.env.DEV) return sharedLoader.loadAsync(url);

  const basePath = url.slice(0, url.lastIndexOf("/") + 1);
  const cachedBuf = await readPersistentGLB(url);
  if (cachedBuf) return sharedLoader.parseAsync(cachedBuf, basePath);

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to load ${url} (${res.status})`);
  const buf = await res.arrayBuffer();
  void writePersistentGLB(url, buf.slice(0));
  return sharedLoader.parseAsync(buf, basePath);
}

/**
 * Shared cached GLTF loader with priority concurrency pool + persistent browser cache.
 */
export function loadGLTF(url: string, priority = 0): Promise<GLTF> {
  return gltfQueue.enqueue(url, priority, () => loadGLTFWithCache(url));
}

/**
 * Loads and caches a static model asset by its manifest key.
 */
export async function loadAsset(name: AssetKey, priority = 0): Promise<THREE.Group> {
  const cached = assetCache.get(name);
  if (cached) return cached.clone(true);

  const gltf = await loadGLTF(await resolveAssetUrl(name), priority);
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


