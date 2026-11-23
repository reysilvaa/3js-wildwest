import * as THREE from "three";
import type { ICollisionWorld, SeparableEntity } from "../../core/collision.js";

export interface INPCNavigator {
  setStreetNodes(nodes: THREE.Vector3[]): void;
  planPath(currentPos: THREE.Vector3, destination: THREE.Vector3): void;
  computeSteering(
    currentPos: THREE.Vector3,
    _dt: number,
    otherEntities: SeparableEntity[],
    selfId: string,
    collisionWorld: ICollisionWorld
  ): { steerDir: THREE.Vector3; isArrived: boolean; isBlocked: boolean };
  hasWaypoints(): boolean;
  clear(): void;
}

export class NPCNavigator implements INPCNavigator {
  private readonly streetNodes: THREE.Vector3[] = [];
  private readonly pathQueue: THREE.Vector3[] = [];
  private readonly yAxis = new THREE.Vector3(0, 1, 0);
  private currentDestination: THREE.Vector3 | null = null;

  public setStreetNodes(nodes: THREE.Vector3[]): void {
    this.streetNodes.length = 0;
    for (const n of nodes) {
      this.streetNodes.push(n.clone());
    }
  }

  public planPath(currentPos: THREE.Vector3, destination: THREE.Vector3): void {
    this.pathQueue.length = 0;
    this.currentDestination = destination.clone();

    if (this.streetNodes.length === 0) {
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
      // Two-way street rule: Northbound (-Z) walks East (X ~ 10.8), Southbound (+Z) walks West (X ~ 8.8)
      const movingNorth = destination.z < currentPos.z;
      const laneX = movingNorth ? 10.8 : 8.8;
      const jitter = (Math.random() - 0.5) * 0.4;
      const targetX = Math.max(7.8, Math.min(12.2, laneX + jitter));
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
    collisionWorld: ICollisionWorld
  ): { steerDir: THREE.Vector3; isArrived: boolean; isBlocked: boolean } {
    if (this.pathQueue.length === 0 && !this.currentDestination) {
      return { steerDir: new THREE.Vector3(), isArrived: true, isBlocked: false };
    }

    const activeWaypoint = this.pathQueue.length > 0 ? this.pathQueue[0]! : this.currentDestination!;
    const toWaypoint = activeWaypoint.clone().sub(currentPos);
    toWaypoint.y = 0;
    const dist = toWaypoint.length();

    const isFinalDestination = this.pathQueue.length <= 1;
    const arrivalRadius = isFinalDestination ? 0.9 : 0.8;

    if (dist < arrivalRadius) {
      if (this.pathQueue.length > 0) {
        this.pathQueue.shift();
      }
      if (this.pathQueue.length === 0) {
        return { steerDir: new THREE.Vector3(), isArrived: true, isBlocked: false };
      }
    }

    const steerDir = toWaypoint.normalize();
    const avoidanceVec = new THREE.Vector3(0, 0, 0);
    const visionRange = 3.6;

    // 1. Pedestrian Right-Hand-Passing Lateral Steering
    for (let i = 0; i < otherEntities.length; i++) {
      const other = otherEntities[i]!;
      if (other.id === selfId) continue;

      const oPos = other.getPosition();
      const toOther = new THREE.Vector3(oPos.x - currentPos.x, 0, oPos.z - currentPos.z);
      const distToOther = toOther.length();

      if (distToOther < visionRange && distToOther > 0.01) {
        toOther.normalize();
        const forwardDot = steerDir.dot(toOther);
        if (forwardDot > 0.15) {
          const rightSide = new THREE.Vector3(-steerDir.z, 0, steerDir.x);
          const isToRight = toOther.dot(rightSide) > 0;
          const steerSign = isToRight ? -1 : 1;
          const urgency = (visionRange - distToOther) / visionRange;
          avoidanceVec.add(rightSide.multiplyScalar(steerSign * urgency * 2.8));
        }
      }
    }

    if (avoidanceVec.lengthSq() > 0.01) {
      steerDir.add(avoidanceVec).normalize();
    }

    // 2. Multi-Whisker Environment Sensor
    const forwardProbe = currentPos.clone().add(steerDir.clone().multiplyScalar(2.2));
    const nearProbe = currentPos.clone().add(steerDir.clone().multiplyScalar(1.1));
    const centerBlocked =
      collisionWorld.checkPointCollision(forwardProbe, 0.46) ||
      collisionWorld.checkPointCollision(nearProbe, 0.46);

    if (centerBlocked) {
      const angles = [
        Math.PI / 4, -Math.PI / 4,
        Math.PI / 2, -Math.PI / 2,
        (3 * Math.PI) / 4, (-3 * Math.PI) / 4
      ];
      for (const angle of angles) {
        const candidate = steerDir.clone().applyAxisAngle(this.yAxis, angle);
        const probeFar = currentPos.clone().add(candidate.clone().multiplyScalar(1.6));
        if (!collisionWorld.checkPointCollision(probeFar, 0.46)) {
          steerDir.copy(candidate);
          break;
        }
      }
    }

    return { steerDir, isArrived: false, isBlocked: centerBlocked };
  }

  public hasWaypoints(): boolean {
    return this.pathQueue.length > 0;
  }

  public clear(): void {
    this.pathQueue.length = 0;
    this.currentDestination = null;
  }
}
