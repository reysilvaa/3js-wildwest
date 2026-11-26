export interface LoadQueue<T> {
  enqueue: (key: string, priority: number, task: () => Promise<T>) => Promise<T>;
}

/**
 * Priority-ordered concurrency pool so critical/nearby assets download and decode first.
 */
export function createLoadQueue<T>(maxConcurrent = 5): LoadQueue<T> {
  let active = 0;
  const cache = new Map<string, Promise<T>>();
  const queue: Array<{ key: string; priority: number; start: () => void }> = [];

  function pump(): void {
    while (active < maxConcurrent && queue.length > 0) {
      let bestIdx = 0;
      for (let i = 1; i < queue.length; i++) {
        if (queue[i]!.priority > queue[bestIdx]!.priority) bestIdx = i;
      }
      const job = queue.splice(bestIdx, 1)[0]!;
      active++;
      job.start();
    }
  }

  function enqueue(key: string, priority: number, task: () => Promise<T>): Promise<T> {
    const existing = cache.get(key);
    if (existing) {
      const queued = queue.find((j) => j.key === key);
      if (queued && priority > queued.priority) queued.priority = priority;
      return existing;
    }

    const promise = new Promise<T>((resolve, reject) => {
      queue.push({
        key,
        priority,
        start: () => {
          task()
            .then(resolve)
            .catch((err) => {
              cache.delete(key);
              reject(err);
            })
            .finally(() => {
              active--;
              pump();
            });
        },
      });
      pump();
    });

    cache.set(key, promise);
    return promise;
  }

  return { enqueue };
}

export async function prewarmByCameraDistance(
  instances: ReadonlyArray<{ asset: string; pos: readonly [number, number, number] }>,
  buildingAssets: ReadonlySet<string>,
  cameraPos: { x: number; z: number },
  load: (asset: string, priority: number) => Promise<unknown>
): Promise<void> {
  const priorityMap = new Map<string, number>();
  for (const inst of instances) {
    const dist = Math.hypot(inst.pos[0] - cameraPos.x, inst.pos[2] - cameraPos.z);
    const prio = (buildingAssets.has(inst.asset) ? 100 : 20) + Math.max(0, 80 - dist);
    const prev = priorityMap.get(inst.asset);
    if (prev === undefined || prio > prev) priorityMap.set(inst.asset, prio);
  }
  const ordered = [...priorityMap.keys()].sort((a, b) => priorityMap.get(b)! - priorityMap.get(a)!);
  await Promise.all(ordered.map((asset) => load(asset, priorityMap.get(asset)!).catch(() => null)));
}
