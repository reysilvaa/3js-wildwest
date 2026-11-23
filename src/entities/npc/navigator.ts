import * as THREE from "three";
import type { CollisionWorld, SeparableEntity } from "../../core/collision.js";

// 16-ray 360° Virtual Eyes (Context-Based Steering) — precomputed unit circle, zero per-frame allocations
const NUM_RAYS = 16;
const RAY_X = new Float32Array(NUM_RAYS);
const RAY_Z = new Float32Array(NUM_RAYS);
for (let i = 0; i < NUM_RAYS; i++) {
  const angle = (i / NUM_RAYS) * Math.PI * 2;
  RAY_X[i] = Math.sin(angle);
  RAY_Z[i] = Math.cos(angle);
}

export class NPCNavigator {
  private readonly streetNodes: THREE.Vector3[] = [];
  private readonly pathQueue: THREE.Vector3[] = [];
  private currentDestination: THREE.Vector3 | null = null;

  // Reusable scratch buffers — zero per-frame GC allocations
  private readonly _steerDir = new THREE.Vector3();
  private readonly _prevDir = new THREE.Vector3(0, 0, 1);
  private readonly _probe = new THREE.Vector3();
  private readonly _interest = new Float32Array(NUM_RAYS);
  private readonly _danger = new Float32Array(NUM_RAYS);

  public setStreetNodes(nodes: THREE.Vector3[]): void {
    this.streetNodes.length = 0;
    for (const n of nodes) {
      this.streetNodes.push(n.clone());
    }
  }

  public planPath(currentPos: THREE.Vector3, destination: THREE.Vector3): void {
    this.pathQueue.length = 0;
    this.currentDestination = destination.clone();

    const sameSideOutskirt =
      (currentPos.x < -10 && destination.x < -10) ||
      (currentPos.x > 26 && destination.x > 26);

    if (this.streetNodes.length === 0 || sameSideOutskirt || currentPos.distanceTo(destination) < 18) {
      this.pathQueue.push(destination.clone());
      return;
    }

    let startNodeIdx = 0;
    let minStartDist = Infinity;
    for (let i = 0; i < this.streetNodes.length; i++) {
      const node = this.streetNodes[i]!;
      const d = currentPos.distanceTo(node);
      if (d < minStartDist) {
        minStartDist = d;
        startNodeIdx = i;
      }
    }

    let endNodeIdx = 0;
    let minEndDist = Infinity;
    for (let i = 0; i < this.streetNodes.length; i++) {
      const node = this.streetNodes[i]!;
      const d = destination.distanceTo(node);
      if (d < minEndDist) {
        minEndDist = d;
        endNodeIdx = i;
      }
    }

    const pushWaypointsAlongStreet = (baseNode: THREE.Vector3) => {
      // Two-way street rule relative to each street node's centerline
      const movingNorth = destination.z < currentPos.z;
      const laneOffset = movingNorth ? 0.9 : -0.9;
      const jitter = (Math.random() - 0.5) * 0.5;
      const targetX = baseNode.x + laneOffset + jitter;
      const targetZ = baseNode.z + (Math.random() - 0.5) * 0.6;
      this.pathQueue.push(new THREE.Vector3(targetX, baseNode.y, targetZ));
    };

    if (minStartDist > 1.4) {
      pushWaypointsAlongStreet(this.streetNodes[startNodeIdx]!);
    }

    if (startNodeIdx !== endNodeIdx) {
      const step = startNodeIdx < endNodeIdx ? 1 : -1;
      for (let i = startNodeIdx + step; ; i += step) {
        pushWaypointsAlongStreet(this.streetNodes[i]!);
        if (i === endNodeIdx) break;
      }
    }

    const destJitter = new THREE.Vector3((Math.random() - 0.5) * 0.6, 0, (Math.random() - 0.5) * 0.6);
    this.pathQueue.push(destination.clone().add(destJitter));
  }

  public computeSteering(
    currentPos: THREE.Vector3,
    _dt: number,
    otherEntities: SeparableEntity[],
    selfId: string,
    collisionWorld: CollisionWorld
  ): { steerDir: THREE.Vector3; isArrived: boolean; isBlocked: boolean } {
    if (this.pathQueue.length === 0 && !this.currentDestination) {
      this._steerDir.set(0, 0, 0);
      return { steerDir: this._steerDir, isArrived: true, isBlocked: false };
    }

    const activeWaypoint = this.pathQueue.length > 0 ? this.pathQueue[0]! : this.currentDestination!;
    const goalDx = activeWaypoint.x - currentPos.x;
    const goalDz = activeWaypoint.z - currentPos.z;
    const dist = Math.hypot(goalDx, goalDz);

    const arrivalRadius = this.pathQueue.length <= 1 ? 1.0 : 0.9;
    if (dist < arrivalRadius) {
      if (this.pathQueue.length > 0) this.pathQueue.shift();
      if (this.pathQueue.length === 0) {
        this._steerDir.set(0, 0, 0);
        return { steerDir: this._steerDir, isArrived: true, isBlocked: false };
      }
    }

    const invDist = dist > 0.0001 ? 1 / dist : 0;
    const gx = goalDx * invDist;
    const gz = goalDz * invDist;

    // 1. Build 16-ray Interest Map (goal alignment + smooth heading momentum)
    const px = this._prevDir.x;
    const pz = this._prevDir.z;
    for (let i = 0; i < NUM_RAYS; i++) {
      const rx = RAY_X[i]!;
      const rz = RAY_Z[i]!;
      const goalDot = rx * gx + rz * gz;
      const momDot = rx * px + rz * pz;
      this._interest[i] = Math.max(0, goalDot * 0.78 + momDot * 0.22 + 0.15);
      this._danger[i] = 0;
    }

    // 2. Virtual Eyes — Static Obstacle Vision (near 0.85m, mid 1.7m, far 2.7m)
    const probeY = currentPos.y;
    for (let i = 0; i < NUM_RAYS; i++) {
      const rx = RAY_X[i]!;
      const rz = RAY_Z[i]!;
      this._probe.set(currentPos.x + rx * 0.85, probeY, currentPos.z + rz * 0.85);
      if (collisionWorld.checkPointCollision(this._probe, 0.44)) {
        this._danger[i] = 1.0;
        continue;
      }
      this._probe.set(currentPos.x + rx * 1.7, probeY, currentPos.z + rz * 1.7);
      if (collisionWorld.checkPointCollision(this._probe, 0.44)) {
        this._danger[i] = 0.65;
        continue;
      }
      this._probe.set(currentPos.x + rx * 2.7, probeY, currentPos.z + rz * 2.7);
      if (collisionWorld.checkPointCollision(this._probe, 0.44)) {
        this._danger[i] = 0.28;
      }
    }

    // 3. Virtual Eyes — Dynamic NPC Vision (4.2m sight range + right-hand passing bias)
    const visionRange = 4.2;
    for (let j = 0; j < otherEntities.length; j++) {
      const other = otherEntities[j]!;
      if (other.id === selfId || (other.isPaused && other.isPaused())) continue;
      const oPos = other.getPosition();
      const ox = oPos.x - currentPos.x;
      const oz = oPos.z - currentPos.z;
      const d = Math.hypot(ox, oz);
      if (d < visionRange && d > 0.01) {
        const nx = ox / d;
        const nz = oz / d;
        const weight = d < 1.8 ? 1.0 : (visionRange - d) / visionRange;
        for (let i = 0; i < NUM_RAYS; i++) {
          const align = RAY_X[i]! * nx + RAY_Z[i]! * nz;
          if (align > 0.2) {
            const dScore = align * weight * (d < 1.8 ? 1.15 : 0.75);
            if (dScore > this._danger[i]!) this._danger[i] = Math.min(1.0, dScore);
          }
        }
      }
    }

    // 4. Pick best safe direction (weighted blend of top unobstructed rays)
    let bestIdx = -1;
    let bestScore = -1;
    for (let i = 0; i < NUM_RAYS; i++) {
      if (this._danger[i]! >= 0.95) continue;
      const score = this._interest[i]! * (1.0 - this._danger[i]! * 0.85);
      if (score > bestScore) {
        bestScore = score;
        bestIdx = i;
      }
    }

    if (bestIdx === -1) {
      // Completely surrounded — signal blocked so controller reroutes
      this._steerDir.set(-gx, 0, -gz);
      return { steerDir: this._steerDir, isArrived: false, isBlocked: true };
    }

    // Smooth blend with immediate safe neighbors to avoid jagged 22.5° snapping
    let sx = 0;
    let sz = 0;
    for (let offset = -1; offset <= 1; offset++) {
      const idx = (bestIdx + offset + NUM_RAYS) % NUM_RAYS;
      if (this._danger[idx]! >= 0.95) continue;
      const w = (offset === 0 ? 1.0 : 0.45) * Math.max(0.05, this._interest[idx]! * (1.0 - this._danger[idx]! * 0.85));
      sx += RAY_X[idx]! * w;
      sz += RAY_Z[idx]! * w;
    }

    const sLen = Math.hypot(sx, sz);
    if (sLen > 0.001) {
      this._steerDir.set(sx / sLen, 0, sz / sLen);
    } else {
      this._steerDir.set(RAY_X[bestIdx]!, 0, RAY_Z[bestIdx]!);
    }
    this._prevDir.lerp(this._steerDir, 0.35).normalize();

    return { steerDir: this._steerDir, isArrived: false, isBlocked: false };
  }

  public hasWaypoints(): boolean {
    return this.pathQueue.length > 0;
  }

  public clear(): void {
    this.pathQueue.length = 0;
    this.currentDestination = null;
  }
}
