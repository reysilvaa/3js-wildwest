import * as THREE from "three";

export interface SeparableEntity {
  id: string;
  getPosition: () => THREE.Vector3;
  isPaused?: () => boolean;
  model?: { root: THREE.Object3D } | null;
}

/**
 * Single Source of Truth (SSOT) Collision World for static obstacles and dynamic entity separation.
 */
export class CollisionWorld {
  private readonly staticBoxes: THREE.Box3[] = [];
  private static instance: CollisionWorld | null = null;

  public static getInstance(): CollisionWorld {
    if (!CollisionWorld.instance) {
      CollisionWorld.instance = new CollisionWorld();
    }
    return CollisionWorld.instance;
  }

  public addBox(box: THREE.Box3): void {
    this.staticBoxes.push(box);
  }

  public addBoxes(boxes: THREE.Box3[]): void {
    for (const b of boxes) {
      this.staticBoxes.push(b);
    }
  }

  public getBoxes(): readonly THREE.Box3[] {
    return this.staticBoxes;
  }

  public async loadStaticBoxes(url = "/models/npc_data.json"): Promise<THREE.Box3[]> {
    try {
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      if (Array.isArray(data.staticBoxes)) {
        for (const b of data.staticBoxes) {
          if (b.min && b.max) {
            this.staticBoxes.push(
              new THREE.Box3(new THREE.Vector3(...b.min), new THREE.Vector3(...b.max))
            );
          }
        }
      }
    } catch (err) {
      console.warn("[CollisionWorld] Failed to load static collision boxes:", err);
    }
    return this.staticBoxes;
  }

  /**
   * Check if a sphere/cylinder footprint intersects any static world box.
   */
  public checkPointCollision(pos: THREE.Vector3, radius = 0.46): boolean {
    const minX = pos.x - radius;
    const maxX = pos.x + radius;
    const minY = pos.y + 0.1;
    const maxY = pos.y + 1.55;
    const minZ = pos.z - radius;
    const maxZ = pos.z + radius;

    for (let i = 0; i < this.staticBoxes.length; i++) {
      const b = this.staticBoxes[i]!;
      if (
        minX <= b.max.x && maxX >= b.min.x &&
        minY <= b.max.y && maxY >= b.min.y &&
        minZ <= b.max.z && maxZ >= b.min.z
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Pushes a position out of all intersecting static collision boxes.
   */
  public resolvePenetration(pos: THREE.Vector3, radius = 0.46): void {
    for (let i = 0; i < this.staticBoxes.length; i++) {
      const box = this.staticBoxes[i]!;
      if (
        pos.x + radius > box.min.x &&
        pos.x - radius < box.max.x &&
        pos.z + radius > box.min.z &&
        pos.z - radius < box.max.z
      ) {
        const overlapX1 = pos.x + radius - box.min.x;
        const overlapX2 = box.max.x - (pos.x - radius);
        const overlapZ1 = pos.z + radius - box.min.z;
        const overlapZ2 = box.max.z - (pos.z - radius);

        const minX = Math.min(overlapX1, overlapX2);
        const minZ = Math.min(overlapZ1, overlapZ2);

        if (minX < minZ) {
          if (overlapX1 < overlapX2) pos.x = box.min.x - radius - 0.12;
          else pos.x = box.max.x + radius + 0.12;
        } else {
          if (overlapZ1 < overlapZ2) pos.z = box.min.z - radius - 0.12;
          else pos.z = box.max.z + radius + 0.12;
        }
      }
    }
  }

  /**
   * Mutual separation between entities with 1.4m clearance to prevent overlapping models.
   */
  public resolveEntitySeparation(entities: SeparableEntity[], minDist = 1.4): void {
    const minDistSq = minDist * minDist;

    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < entities.length; i++) {
        const a = entities[i];
        if (!a || (a.isPaused && a.isPaused())) continue;
        const posA = a.getPosition();

        for (let j = i + 1; j < entities.length; j++) {
          const b = entities[j];
          if (!b || (b.isPaused && b.isPaused())) continue;
          const posB = b.getPosition();

          const dx = posA.x - posB.x;
          const dz = posA.z - posB.z;
          const dSq = dx * dx + dz * dz;

          if (dSq < minDistSq && dSq > 0.00001) {
            const d = Math.sqrt(dSq);
            const overlap = minDist - d;
            const nx = dx / d;
            const nz = dz / d;

            posA.x += nx * overlap * 0.5;
            posA.z += nz * overlap * 0.5;
            posB.x -= nx * overlap * 0.5;
            posB.z -= nz * overlap * 0.5;

            if (a.model) {
              a.model.root.position.x = posA.x;
              a.model.root.position.z = posA.z;
            }
            if (b.model) {
              b.model.root.position.x = posB.x;
              b.model.root.position.z = posB.z;
            }
          }
        }
      }
    }
  }
}
