import * as THREE from "three";

export const defaultStreetNodes: THREE.Vector3[] = [
  new THREE.Vector3(10.0, 0, -28.0),
  new THREE.Vector3(10.0, 0, -18.0),
  new THREE.Vector3(10.0, 0, -8.0),
  new THREE.Vector3(10.0, 0, 2.0),
  new THREE.Vector3(10.0, 0, 12.0),
  new THREE.Vector3(10.0, 0, 22.0),
];

export function findClosestStreetNode(pos: THREE.Vector3, nodes: THREE.Vector3[] = defaultStreetNodes): number {
  let closestIdx = 0;
  let minDist = Infinity;
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    if (!node) continue;
    const d = pos.distanceTo(node);
    if (d < minDist) {
      minDist = d;
      closestIdx = i;
    }
  }
  return closestIdx;
}

export function planPath(
  startPos: THREE.Vector3,
  destination: THREE.Vector3,
  nodes: THREE.Vector3[] = defaultStreetNodes
): THREE.Vector3[] {
  const path: THREE.Vector3[] = [];
  const startNodeIdx = findClosestStreetNode(startPos, nodes);
  const endNodeIdx = findClosestStreetNode(destination, nodes);

  if (startPos.distanceTo(nodes[startNodeIdx]!) > 1.2) {
    path.push(nodes[startNodeIdx]!.clone());
  }

  if (startNodeIdx !== endNodeIdx) {
    const step = startNodeIdx < endNodeIdx ? 1 : -1;
    for (let i = startNodeIdx + step; ; i += step) {
      path.push(nodes[i]!.clone());
      if (i === endNodeIdx) break;
    }
  }

  path.push(destination.clone());
  return path;
}

const tempBox = new THREE.Box3();
const minVec = new THREE.Vector3();
const maxVec = new THREE.Vector3();

export function checkCollision(pos: THREE.Vector3, radius: number, boxes: THREE.Box3[]): boolean {
  minVec.set(pos.x - radius, pos.y + 0.1, pos.z - radius);
  maxVec.set(pos.x + radius, pos.y + 1.55, pos.z + radius);
  tempBox.set(minVec, maxVec);

  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (box && box.intersectsBox(tempBox)) return true;
  }
  return false;
}

export function resolvePenetration(pos: THREE.Vector3, radius: number, boxes: THREE.Box3[]): void {
  for (let i = 0; i < boxes.length; i++) {
    const box = boxes[i];
    if (!box) continue;

    if (
      pos.x + radius > box.min.x &&
      pos.x - radius < box.max.x &&
      pos.z + radius > box.min.z &&
      pos.z - radius < box.max.z &&
      pos.y + 0.1 < box.max.y &&
      pos.y + 1.55 > box.min.y
    ) {
      const overlapX1 = Math.abs(pos.x + radius - box.min.x);
      const overlapX2 = Math.abs(box.max.x - (pos.x - radius));
      const overlapZ1 = Math.abs(pos.z + radius - box.min.z);
      const overlapZ2 = Math.abs(box.max.z - (pos.z - radius));
      const minOverlap = Math.min(overlapX1, overlapX2, overlapZ1, overlapZ2);

      if (minOverlap === overlapX1 || minOverlap === overlapX2) {
        if (overlapX1 < overlapX2) pos.x = box.min.x - radius - 0.08;
        else pos.x = box.max.x + radius + 0.08;
      } else {
        if (overlapZ1 < overlapZ2) pos.z = box.min.z - radius - 0.08;
        else pos.z = box.max.z + radius + 0.08;
      }
    }
  }
}
