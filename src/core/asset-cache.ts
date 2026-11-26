const BUILD_ID = typeof __BUILD_ID__ !== "undefined" ? __BUILD_ID__ : "dev";
const CACHE_PREFIX = "rey-ww-models-";
const CACHE_NAME = `${CACHE_PREFIX}${BUILD_ID}`;
const IDB_NAME = "rey-ww-assets";
const IDB_STORE = "glb";
const BUILD_KEY = "rey_ww_cache_build";

let prunePromise: Promise<void> | null = null;

function openAssetDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function clearOldCachesIfNewBuild(): Promise<void> {
  if (prunePromise) return prunePromise;
  prunePromise = (async () => {
    try {
      if (typeof caches !== "undefined") {
        const keys = await caches.keys();
        await Promise.all(
          keys.filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME).map((k) => caches.delete(k))
        );
      }
      if (typeof indexedDB !== "undefined" && typeof localStorage !== "undefined") {
        if (localStorage.getItem(BUILD_KEY) !== BUILD_ID) {
          const db = await openAssetDatabase();
          await new Promise<void>((resolve) => {
            const tx = db.transaction(IDB_STORE, "readwrite");
            tx.objectStore(IDB_STORE).clear();
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
          });
          localStorage.setItem(BUILD_KEY, BUILD_ID);
        }
      }
    } catch {
      // Non-fatal in private/restricted browser modes
    }
  })();
  return prunePromise;
}

export async function getCachedModel(url: string): Promise<ArrayBuffer | null> {
  await clearOldCachesIfNewBuild();
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      const hit = await cache.match(url);
      if (hit) return await hit.arrayBuffer();
    }
    if (typeof indexedDB !== "undefined") {
      const db = await openAssetDatabase();
      return await new Promise((resolve) => {
        const req = db.transaction(IDB_STORE, "readonly").objectStore(IDB_STORE).get(url);
        req.onsuccess = () => resolve(req.result instanceof ArrayBuffer ? req.result : null);
        req.onerror = () => resolve(null);
      });
    }
  } catch {
    // Ignore storage quota/privacy mode errors and fall back to network
  }
  return null;
}

export async function saveCachedModel(url: string, buf: ArrayBuffer): Promise<void> {
  await clearOldCachesIfNewBuild();
  try {
    if (typeof caches !== "undefined") {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(url, new Response(buf, { headers: { "Content-Type": "model/gltf-binary" } }));
      return;
    }
    if (typeof indexedDB !== "undefined") {
      const db = await openAssetDatabase();
      await new Promise<void>((resolve) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(buf, url);
        tx.oncomplete = () => resolve();
        tx.onerror = () => resolve();
      });
    }
  } catch {
    // Non-fatal: continue without persistent storage
  }
}
