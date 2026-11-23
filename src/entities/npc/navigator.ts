import * as THREE from "three";
import type { CollisionWorld, SeparableEntity } from "../../core/collision.js";

const WHISKER_ANGLES = [
  Math.PI / 4, -Math.PI / 4,
  Math.PI / 2, -Math.PI / 2,
  (3 * Math.PI) / 4, (-3 * Math.PI) / 4,
];

export class NPCNavigator {
  private readonly streetNodes: THREE.Vector3[] = [];
  private readonly pathQueue: THREE.Vector3[] = [];
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private currentDestination: THREE.Vector3 | null = null;

  // Reusable scratch vectors — zero per-frame GC allocations
  private readonly _steerDir = new THREE.Vector3();
  private readonly _avoid = new THREE.Vector3();
  private readonly _toOther = new THREE.Vector3();
  private readonly _right = new THREE.Vector3();
  private readonly _probe = new THREE.Vector3();
  private readonly _cand = new THREE.Vector3();

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
    this._steerDir.subVectors(activeWaypoint, currentPos);
    this._steerDir.y = 0;
    const dist = this._steerDir.length();

    const arrivalRadius = this.pathQueue.length <= 1 ? 0.9 : 0.8;
    if (dist < arrivalRadius) {
      if (this.pathQueue.length > 0) this.pathQueue.shift();
      if (this.pathQueue.length === 0) {
        this._steerDir.set(0, 0, 0);
        return { steerDir: this._steerDir, isArrived: true, isBlocked: false };
      }
    }

    if (dist > 0.0001) this._steerDir.divideScalar(dist);
    this._avoid.set(0, 0, 0);
    const visionRange = 4.2;

    // 1. Pedestrian Right-Hand-Passing + Close-Range Personal Space Repulsion
    for (let i = 0; i < otherEntities.length; i++) {
      const other = otherEntities[i]!;
      if (other.id === selfId || (other.isPaused && other.isPaused())) continue;

      const oPos = other.getPosition();
      this._toOther.set(oPos.x - currentPos.x, 0, oPos.z - currentPos.z);
      const distToOther = this._toOther.length();

      if (distToOther < visionRange && distToOther > 0.01) {
        this._toOther.divideScalar(distToOther);
        const dot = this._steerDir.dot(this._toOther);
        // Hard close-range repulsion (< 2.0m) from any angle prevents head-on collisions
        if (distToOther < 2.0) {
          const push = (2.0 - distToOther) / 2.0;
          this._avoid.addScaledVector(this._toOther, -push * 4.5);
        }
        if (dot > 0.05) {
          this._right.set(-this._steerDir.z, 0, this._steerDir.x);
          const steerSign = this._toOther.dot(this._right) > 0 ? -1 : 1;
          const urgency = (visionRange - distToOther) / visionRange;
          this._avoid.addScaledVector(this._right, steerSign * urgency * 4.0);
        }
      }
    }

    if (this._avoid.lengthSq() > 0.01) {
      this._steerDir.add(this._avoid).normalize();
    }

    // 2. Multi-Whisker Environment Sensor (zero allocations)
    this._probe.copy(currentPos).addScaledVector(this._steerDir, 2.2);
    let centerBlocked = collisionWorld.checkPointCollision(this._probe, 0.46);
    if (!centerBlocked) {
      this._probe.copy(currentPos).addScaledVector(this._steerDir, 1.1);
      centerBlocked = collisionWorld.checkPointCollision(this._probe, 0.46);
    }

    if (centerBlocked) {
      for (let i = 0; i < WHISKER_ANGLES.length; i++) {
        this._cand.copy(this._steerDir).applyAxisAngle(this.yAxis, WHISKER_ANGLES[i]!);
        this._probe.copy(currentPos).addScaledVector(this._cand, 1.6);
        if (!collisionWorld.checkPointCollision(this._probe, 0.46)) {
          this._steerDir.copy(this._cand);
          break;
        }
      }
    }

    return { steerDir: this._steerDir, isArrived: false, isBlocked: centerBlocked };
  }

  public hasWaypoints(): boolean {
    return this.pathQueue.length > 0;
  }

  public clear(): void {
    this.pathQueue.length = 0;
    this.currentDestination = null;
  }
}
